require("./index.css");
const { Elm } = require("./Main.elm");
import {
  Metadata,
  PROGRAM_ID as METADATA_ID,
} from "@metaplex-foundation/mpl-token-metadata";
import { TransactionPayload, Percentage } from "@orca-so/common-sdk";
import {
  WhirlpoolContext,
  AccountFetcher,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  swapQuoteByInputToken,
  buildWhirlpoolClient,
  PDAUtil,
  ORCA_WHIRLPOOLS_CONFIG,
} from "@orca-so/whirlpools-sdk";
import { getWallets } from "@wallet-standard/core";
import {
  StandardWalletAdapter,
  isWalletAdapterCompatibleWallet,
} from "@solana/wallet-standard-wallet-adapter-base";
import { WalletAdapter } from "@solana/wallet-adapter-base";
import {
  BraveWalletAdapter,
  //GlowWalletAdapter,
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  LedgerWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { web3, utils } from "@project-serum/anchor";
const { Transaction, Connection, PublicKey, LAMPORTS_PER_SOL } = web3;
import { u64, Token } from "@solana/spl-token";

const app = Elm.Main.init({
  node: document.getElementById("app"),
  flags: {
    screen: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
  },
});

// @ts-ignore
// eslint-disable-next-line no-undef
const RPC_URL: string = RPC_URL_;

const connection = new Connection(RPC_URL);
const fetcher = new AccountFetcher(connection);

const SOL = {
  mint: new PublicKey("So11111111111111111111111111111111111111112"),
  decimals: 9,
};
const BONK = {
  mint: new PublicKey("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"),
  decimals: 5,
};

const wallets = getWallets();

const options: Record<string, WalletAdapter<string>> = {};

interface TokenStuff {
  mintId: string;
  tokenAcct: string;
  amount: string;
  decimals: number;
}

interface Details {
  img: string;
  name: string;
  burnRating: number;
}

[
  //new GlowWalletAdapter(),
  new PhantomWalletAdapter(),
  new BraveWalletAdapter(),
  new SolflareWalletAdapter(),
  new LedgerWalletAdapter(),
].forEach((adapter) => {
  // eslint-disable-next-line fp/no-mutation
  options[adapter.name] = adapter;
  app.ports.walletUpdate.send({
    name: adapter.name,
    icon: adapter.icon,
  });
});

wallets.on("register", (newWallet: any) => {
  console.log("wallet registered:", newWallet.name);
  if (isWalletAdapterCompatibleWallet(newWallet)) {
    // eslint-disable-next-line fp/no-mutation
    options[newWallet.name] = new StandardWalletAdapter({ wallet: newWallet });
  } else {
    console.log("not compat:", newWallet.name);
  }
  app.ports.walletUpdate.send({
    name: newWallet.name,
    icon: newWallet.icon,
  });
});

app.ports.connect.subscribe((name: string) =>
  wrap(
    async () => {
      const wallet = getWallet(name);

      await wallet.connect();

      if (wallet.connected) {
        app.ports.connectCb.send(wallet.publicKey.toString());

        const nfts = await fetchOwned(wallet.publicKey);

        app.ports.nftsCb.send(nfts);
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

      const nfts = await fetchOwned(wallet.publicKey);

      app.ports.nftsCb.send(nfts);
    },
    (_e: any) => {
      // TODO
    }
  )
);

const wrap = (fn1: any, fn2: any) =>
  fn1().catch((e: any) => {
    console.error(e);
    fn2(e);
  });

app.ports.fetchDetails.subscribe(({ mintId }: { mintId: string }) =>
  wrap(
    async () => {
      const details = await fetchDetails(new web3.PublicKey(mintId));
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
      const nfts = await fetchEmpty(wallet.publicKey);

      if (nfts.length === 0) {
        console.log("no empties");
        return app.ports.cleanupCb.send(null);
      }

      const ixs = nfts.map((n) => closeTokenAccount(wallet.publicKey, n));
      const totalHaul = (
        await Promise.all(nfts.map((n) => connection.getBalance(n)))
      ).reduce((acc, v) => acc + v);
      const [_txt, swapTx] = await buildSwapTx(totalHaul, wallet);
      const transaction = ixs
        .concat(swapTx.transaction.instructions)
        .reduce((acc, tx) => acc.add(tx), new Transaction());

      const { blockhash } = await connection.getLatestBlockhash();

      // eslint-disable-next-line fp/no-mutation
      transaction.recentBlockhash = blockhash;
      // eslint-disable-next-line fp/no-mutation
      transaction.feePayer = wallet.publicKey;

      const tx = await wallet.sendTransaction(transaction, connection, {
        signers: swapTx.signers,
      });

      console.log(tx);
    },
    (_: any) => {
      app.ports.cleanupCb.send(null);
    }
  )
);

const getWallet = (walletName: string): WalletAdapter<string> => {
  const wallet = options[walletName];
  if (!wallet) {
    throw Error(`Wallet not found: ${walletName}`);
  }
  return wallet;
};

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
          `Token account ${ta.toString().slice(0, 15)}... will be closed`
        );

        const balance = await connection.getBalance(ta);
        app.ports.statusUpdate.send(
          `You are reclaiming ${balance / LAMPORTS_PER_SOL} SOL`
        );
        const tokenBalance = await connection.getTokenAccountBalance(ta);

        // https://github.com/ExodusMovement/solana-spl-token/commit/4a464e50ae63ddf50a86181ca6710155c75cb660#diff-85ed211f93a91c4e34bebb00e6c8f27542692fcd8f708be14383973540aac719R193
        const burnIx = await Token.createBurnInstruction(
          utils.token.TOKEN_PROGRAM_ID,
          mintAddress,
          ta,
          wallet.publicKey,
          [],
          tokenBalance.value.uiAmount || 0
        );

        const closeIx = closeTokenAccount(wallet.publicKey, ta);

        const [amt, swapTx] = await buildSwapTx(balance, wallet);
        app.ports.statusUpdate.send(`You will receive ${amt} BONK`);

        const transaction = [burnIx, closeIx]
          .concat(swapTx.transaction.instructions)
          .reduce((acc, tx) => acc.add(tx), new Transaction());

        const { blockhash } = await connection.getLatestBlockhash();

        // eslint-disable-next-line fp/no-mutation
        transaction.recentBlockhash = blockhash;
        // eslint-disable-next-line fp/no-mutation
        transaction.feePayer = wallet.publicKey;

        app.ports.statusUpdate.send("Awaiting transaction confirmation...");
        const tx = await wallet.sendTransaction(transaction, connection, {
          signers: swapTx.signers,
        });

        app.ports.burnCb.send(tx);
      },
      (_: any) => {
        app.ports.burnCb.send(null);
      }
    )
);

const closeTokenAccount = (
  owner: web3.PublicKey,
  tokenAccount: web3.PublicKey
): web3.TransactionInstruction => {
  //const tokenBalance = await connection.getTokenAccountBalance(tokenAccount);

  //if (tokenBalance.value.uiAmount !== 0) {
  //throw Error("Not empty");
  //}

  // https://github.com/ExodusMovement/solana-spl-token/commit/4a464e50ae63ddf50a86181ca6710155c75cb660#diff-85ed211f93a91c4e34bebb00e6c8f27542692fcd8f708be14383973540aac719R201
  return Token.createCloseAccountInstruction(
    utils.token.TOKEN_PROGRAM_ID,
    tokenAccount,
    owner,
    owner,
    []
  );
};

const buildSwapTx = async (
  size: number,
  wallet: WalletAdapter
): Promise<[string, TransactionPayload]> => {
  const tick_spacing = 64;
  const whirlpoolPubkey = PDAUtil.getWhirlpool(
    ORCA_WHIRLPOOL_PROGRAM_ID,
    ORCA_WHIRLPOOLS_CONFIG,
    SOL.mint,
    BONK.mint,
    tick_spacing
  ).publicKey;

  const ctx = WhirlpoolContext.from(
    connection,
    wallet,
    ORCA_WHIRLPOOL_PROGRAM_ID
  );
  const client = buildWhirlpoolClient(ctx);
  const whirlpool = await client.getPool(whirlpoolPubkey);

  const whirlpoolData = await whirlpool.getData();

  const inputTokenQuote = await swapQuoteByInputToken(
    whirlpool,
    whirlpoolData.tokenMintA,
    //@ts-ignore
    new u64(size),
    Percentage.fromFraction(1, 1000), // 0.1%
    ORCA_WHIRLPOOL_PROGRAM_ID,
    fetcher,
    true
  );

  //@ts-ignore
  const est: number = Math.round(
    Number(inputTokenQuote.estimatedAmountOut) / 100000
  );

  const tx = await (await whirlpool.swap(inputTokenQuote)).build();

  return [`~${est.toLocaleString()}`, tx];
};

const fetchEmpty = async (
  walletAddress: web3.PublicKey
): Promise<web3.PublicKey[]> => {
  const tokensRaw = await connection.getParsedTokenAccountsByOwner(
    walletAddress,
    {
      programId: utils.token.TOKEN_PROGRAM_ID,
    }
  );

  return tokensRaw.value.flatMap((tk) =>
    tk.account.data.parsed.info.tokenAmount.amount === String(0)
      ? [new web3.PublicKey(tk.pubkey)]
      : []
  );
};

const _fetchBurns = async (mintId: web3.PublicKey): Promise<number> => {
  const xs = await connection.getSignaturesForAddress(mintId, {
    limit: 25,
  });
  const txs = await connection.getParsedTransactions(
    xs.map((x) => x.signature),
    { maxSupportedTransactionVersion: 0 }
  );
  const ixs = txs.filter(
    (tx) =>
      tx &&
      tx.transaction.message.instructions.some((ix) => {
        //@ts-ignore
        if (!ix.parsed) {
          return false;
        }
        //@ts-ignore
        const parsed: any = ix.parsed;

        const pass =
          parsed.type === "burn" &&
          mintId.equals(new web3.PublicKey(parsed.info.mint)) &&
          ix.programId.equals(utils.token.TOKEN_PROGRAM_ID);

        if (pass) {
          console.log(ix);
        }

        return pass;
      })
  );
  console.log(ixs.map((x) => x?.transaction.signatures));
  return ixs.length;
};

const fetchOwned = async (
  walletAddress: web3.PublicKey
): Promise<TokenStuff[]> => {
  const tokensRaw = await connection.getParsedTokenAccountsByOwner(
    walletAddress,
    {
      programId: utils.token.TOKEN_PROGRAM_ID,
    }
  );

  return tokensRaw.value.flatMap((tk) => {
    const data: web3.TokenAmount = tk.account.data.parsed.info.tokenAmount;
    return data.amount !== String(0)
      ? [
          {
            mintId: new web3.PublicKey(
              tk.account.data.parsed.info.mint
            ).toString(),
            tokenAcct: new web3.PublicKey(tk.pubkey).toString(),
            amount: data.amount,
            decimals: data.decimals,
          },
        ]
      : [];
  });
};

const getMetadataPDA = (mintId: web3.PublicKey): web3.PublicKey => {
  const [addr] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METADATA_ID.toBuffer(), mintId.toBuffer()],
    METADATA_ID
  );

  return addr;
};

const fetchDetails = async (mintId: web3.PublicKey): Promise<Details> => {
  const metadataPDA = getMetadataPDA(mintId);

  const account = await connection.getAccountInfo(metadataPDA);

  if (!account) {
    throw Error("no meta");
  }

  const [metadata] = Metadata.fromAccountInfo(account);

  const res = await fetch(metadata.data.uri, { cache: "no-store" });
  const json = await res.json();

  return {
    img: json.image,
    name: json.name,
    //burnRating: await fetchBurns(mintId),
    burnRating: 0,
  };
};
