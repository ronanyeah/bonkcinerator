port module Ports exposing (burn, burnCb, cleanup, cleanupCb, connect, connectCb, fetchDetails, fetchDetailsCb, fetchWallets, log, nftsCb, refreshTokens, statusUpdate, walletUpdate)

import Types exposing (Details, Token, Wallet)



-- OUT


port log : String -> Cmd msg


port fetchWallets : () -> Cmd msg


port refreshTokens : { walletName : String } -> Cmd msg


port fetchDetails : { walletName : String, mintId : String } -> Cmd msg


port cleanup : { walletName : String } -> Cmd msg


port burn : { walletName : String, mintId : String } -> Cmd msg


port connect : String -> Cmd msg



-- IN


port nftsCb : (List Token -> msg) -> Sub msg


port walletUpdate : (Wallet -> msg) -> Sub msg


port statusUpdate : (String -> msg) -> Sub msg


port connectCb : (Maybe String -> msg) -> Sub msg


port cleanupCb : (Maybe String -> msg) -> Sub msg


port burnCb : (Maybe String -> msg) -> Sub msg


port fetchDetailsCb : (Maybe Details -> msg) -> Sub msg
