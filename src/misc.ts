import { web3, utils } from "@project-serum/anchor";
import {
  Metadata,
  PROGRAM_ID as METADATA_ID,
} from "@metaplex-foundation/mpl-token-metadata";
import { Wallets } from "@wallet-standard/core";
import {
  DecimalUtil,
  TransactionPayload,
  Percentage,
} from "@orca-so/common-sdk";
import {
  WhirlpoolContext,
  AccountFetcher,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  swapQuoteByInputToken,
  buildWhirlpoolClient,
  PDAUtil,
  ORCA_WHIRLPOOLS_CONFIG,
} from "@orca-so/whirlpools-sdk";
import Decimal from "decimal.js";
import { WalletAdapter } from "@solana/wallet-adapter-base";
import { Token } from "@solana/spl-token";
import { StandardWalletAdapter } from "@solana/wallet-standard-wallet-adapter-base";

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

const SOL = {
  mint: new web3.PublicKey("So11111111111111111111111111111111111111112"),
  decimals: 9,
};

const BONK = {
  mint: new web3.PublicKey("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"),
  decimals: 5,
};

const fetchOwned = async (
  walletAddress: web3.PublicKey,
  connection: web3.Connection
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

const fetchDetails = async (
  mintId: web3.PublicKey,
  connection: web3.Connection
): Promise<Details> => {
  const metadataPDA = getMetadataPDA(mintId);

  const account = await connection.getAccountInfo(metadataPDA);

  if (!account) {
    throw Error("no meta");
  }

  const [metadata] = Metadata.fromAccountInfo(account);

  const data = await (async () => {
    try {
      const res = await fetch(metadata.data.uri, { cache: "no-store" });
      const json = await res.json();
      return {
        img: json.image,
        name: json.name,
        //burnRating: await fetchBurns(mintId),
        burnRating: 0,
      };
    } catch (e) {
      return {
        img: "/what.png",
        // eslint-disable-next-line no-control-regex
        name: metadata.data.name.replace(/\x00/g, ""),
        burnRating: 0,
      };
    }
  })();

  return data;
};

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
  wallet: WalletAdapter,
  fetcher: AccountFetcher,
  connection: web3.Connection
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
    DecimalUtil.toU64(new Decimal(size)),
    Percentage.fromFraction(1, 100), // 1%
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
  walletAddress: web3.PublicKey,
  connection: web3.Connection
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

const wrap = (fn1: any, fn2: any) =>
  fn1().catch((e: any) => {
    console.error(e);
    fn2(e);
  });

const _fetchBurns = async (
  mintId: web3.PublicKey,
  connection: web3.Connection
): Promise<number> => {
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

const getBackpackWallet = async (
  wallets: Wallets
): Promise<WalletAdapter<string>> =>
  new Promise((res) => {
    window.addEventListener("load", () => {
      // @ts-ignore
      window.xnft.on("connect", async () => {
        // @ts-ignore
        const wallet = new StandardWalletAdapter({ wallet: wallets.get()[0] });
        await wallet.connect();
        res(wallet);
      });
    });
  });

export {
  wrap,
  fetchDetails,
  fetchOwned,
  buildSwapTx,
  closeTokenAccount,
  fetchEmpty,
  getBackpackWallet,
};
