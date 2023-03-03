require("./index.css");
const { Elm } = require("./Main.elm");
import { DecimalUtil } from "@orca-so/common-sdk";
import { AccountFetcher } from "@orca-so/whirlpools-sdk";
import { getWallets } from "@wallet-standard/core";
import {
  SolanaMobileWalletAdapter,
  createDefaultAddressSelector,
  createDefaultAuthorizationResultCache,
  createDefaultWalletNotFoundHandler,
} from "@solana-mobile/wallet-adapter-mobile";
import {
  StandardWalletAdapter,
  isWalletAdapterCompatibleWallet,
} from "@solana/wallet-standard-wallet-adapter-base";
import {
  WalletAdapter,
  WalletAdapterNetwork,
} from "@solana/wallet-adapter-base";
import {
  GlowWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { web3, utils } from "@project-serum/anchor";
const {
  VersionedTransaction,
  TransactionMessage,
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
} = web3;
import { Token } from "@solana/spl-token";
import Decimal from "decimal.js";
import {
  buildSwapTx,
  closeTokenAccount,
  fetchOwned,
  fetchDetails,
  wrap,
  fetchEmpty,
  getBackpackWallet,
} from "./misc";

const wallets = getWallets();

// @ts-ignore
// eslint-disable-next-line no-undef
const RPC_URL: string = RPC_URL_;

const connection = new Connection(RPC_URL);
const fetcher = new AccountFetcher(connection);

const options: Record<string, WalletAdapter<string>> = {};
const getWallet = (walletName: string): WalletAdapter<string> => {
  const wallet = options[walletName];
  if (!wallet) {
    throw Error(`Wallet not found: ${walletName}`);
  }
  return wallet;
};

(async () => {
  const app = await (async () => {
    const isXnft = window.top !== window;
    if (isXnft) {
      const wallet = await getBackpackWallet(wallets);
      // eslint-disable-next-line fp/no-mutation
      options[wallet.name] = wallet;

      const app = Elm.Main.init({
        node: document.getElementById("app"),
        flags: {
          screen: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
          xnft: {
            wallet: {
              name: wallet.name,
              icon: wallet.icon,
            },
            address: wallet.publicKey.toString(),
          },
        },
      });

      fetchOwned(wallet.publicKey, connection)
        .then((nfts) => {
          app.ports.nftsCb.send(nfts);
        })
        .catch((e) => {
          console.error(e);
          app.ports.nftsCb.send([]);
        });

      return app;
    } else {
      return Elm.Main.init({
        node: document.getElementById("app"),
        flags: {
          screen: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
          xnft: null,
        },
      });
    }
  })();

  app.ports.connect.subscribe((name: string) =>
    wrap(
      async () => {
        const wallet = getWallet(name);

        await wallet.connect();

        if (wallet.connected) {
          app.ports.connectCb.send(wallet.publicKey.toString());

          fetchOwned(wallet.publicKey, connection)
            .then((nfts) => {
              app.ports.nftsCb.send(nfts);
            })
            .catch((e) => {
              console.error(e);
              app.ports.nftsCb.send([]);
            });
        } else {
          console.error("not connected:", wallet);
          app.ports.connectCb.send(null);
        }
      },
      (_e: any) => {
        app.ports.connectCb.send(null);
      }
    )
  );

  app.ports.refreshTokens.subscribe(({ walletName }: { walletName: string }) =>
    wrap(
      async () => {
        const wallet = getWallet(walletName);

        const nfts = await fetchOwned(wallet.publicKey, connection);

        app.ports.nftsCb.send(nfts);
      },
      (_e: any) => {
        // TODO
      }
    )
  );

  app.ports.fetchDetails.subscribe(({ mintId }: { mintId: string }) =>
    wrap(
      async () => {
        const details = await fetchDetails(
          new web3.PublicKey(mintId),
          connection
        );
        app.ports.fetchDetailsCb.send(details);
      },
      (_: any) => {
        app.ports.fetchDetailsCb.send(null);
      }
    )
  );

  app.ports.cleanup.subscribe(({ walletName }: { walletName: string }) =>
    wrap(
      async () => {
        const wallet = getWallet(walletName);
        const nfts = await fetchEmpty(wallet.publicKey, connection);

        if (nfts.length === 0) {
          console.log("no empties");
          return app.ports.cleanupCb.send(null);
        }

        const ixs = nfts.map((n) => closeTokenAccount(wallet.publicKey, n));
        const totalHaul = (
          await Promise.all(nfts.map((n) => connection.getBalance(n)))
        ).reduce((acc, v) => acc + v);
        const [_txt, swapTx] = await buildSwapTx(
          totalHaul,
          wallet,
          fetcher,
          connection
        );

        const { blockhash } = await connection.getLatestBlockhash();

        const msg = new TransactionMessage({
          payerKey: wallet.publicKey,
          instructions: ixs.concat(swapTx.transaction.instructions),
          recentBlockhash: blockhash,
        });

        const transaction = new VersionedTransaction(msg.compileToV0Message());

        transaction.sign(swapTx.signers);

        const tx = await wallet.sendTransaction(transaction, connection);

        console.log(tx);
      },
      (_: any) => {
        app.ports.cleanupCb.send(null);
      }
    )
  );

  app.ports.burn.subscribe(
    ({ walletName, mintId }: { walletName: string; mintId: string }) =>
      wrap(
        async () => {
          const wallet = getWallet(walletName);

          const mintAddress = new PublicKey(mintId);

          const ta = await utils.token.associatedAddress({
            mint: mintAddress,
            owner: wallet.publicKey,
          });
          app.ports.statusUpdate.send(
            `🗃️ Token account ${ta.toString().slice(0, 15)}... will be closed`
          );

          const balance = await connection.getBalance(ta);
          app.ports.statusUpdate.send(
            `💸 You are reclaiming ${balance / LAMPORTS_PER_SOL} SOL`
          );
          const tokenBalance = await connection.getTokenAccountBalance(ta);

          // Using @solana/spl-token@0.1.8 to be compatible with Orca SDKs.
          // https://github.com/ExodusMovement/solana-spl-token/commit/4a464e50ae63ddf50a86181ca6710155c75cb660#diff-85ed211f93a91c4e34bebb00e6c8f27542692fcd8f708be14383973540aac719R193
          const burnIx = await Token.createBurnInstruction(
            utils.token.TOKEN_PROGRAM_ID,
            mintAddress,
            ta,
            wallet.publicKey,
            [],
            DecimalUtil.toU64(new Decimal(tokenBalance.value.amount))
          );

          const closeIx = closeTokenAccount(wallet.publicKey, ta);

          const [amt, swapTx] = await buildSwapTx(
            balance,
            wallet,
            fetcher,
            connection
          );
          app.ports.statusUpdate.send(`🐶 You will receive ${amt} BONK`);

          const { blockhash } = await connection.getLatestBlockhash();

          const msg = new TransactionMessage({
            payerKey: wallet.publicKey,
            instructions: [burnIx, closeIx].concat(
              swapTx.transaction.instructions
            ),
            recentBlockhash: blockhash,
          });

          const transaction = new VersionedTransaction(
            msg.compileToV0Message()
          );

          transaction.sign(swapTx.signers);

          app.ports.statusUpdate.send(
            "📡 Awaiting transaction confirmation..."
          );

          const tx = await wallet.sendTransaction(transaction, connection);

          app.ports.burnCb.send(tx);
        },
        (_: any) => {
          app.ports.burnCb.send(null);
        }
      )
  );

  app.ports.fetchWallets.subscribe(() =>
    wrap(
      async () => {
        const registered = wallets
          .get()
          .flatMap((newWallet) =>
            isWalletAdapterCompatibleWallet(newWallet)
              ? [new StandardWalletAdapter({ wallet: newWallet })]
              : []
          );
        // eslint-disable-next-line fp/no-mutating-methods
        [
          ...registered,
          ...(registered.some((w) => w.name === "Glow")
            ? []
            : [new GlowWalletAdapter()]),
          ...(registered.some((w) => w.name === "Solflare")
            ? []
            : [new SolflareWalletAdapter()]),
          new SolanaMobileWalletAdapter({
            addressSelector: createDefaultAddressSelector(),
            appIdentity: {
              name: "Bonkcinerator",
              uri: "https://bonkcinerator.com/",
              icon: "/apple-touch-icon.png",
            },
            authorizationResultCache: createDefaultAuthorizationResultCache(),
            cluster: WalletAdapterNetwork.Mainnet,
            onWalletNotFound: createDefaultWalletNotFoundHandler(),
          }),
        ]
          .sort((a, b) => b.name.localeCompare(a.name))
          .forEach((adapter) => {
            if (
              adapter.readyState === "Installed" ||
              (adapter.readyState === "Loadable" &&
                adapter.name === "Mobile Wallet Adapter")
            ) {
              // eslint-disable-next-line fp/no-mutation
              options[adapter.name] = adapter;
              app.ports.walletUpdate.send({
                name: adapter.name,
                icon: adapter.icon,
              });
            }
          });
      },
      (_e: any) => {
        //
      }
    )
  );
})().catch(console.error);
