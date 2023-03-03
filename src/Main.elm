module Main exposing (main)

import Browser
import Dict
import Ports
import Types exposing (Flags, Model, Msg)
import Update exposing (update)
import View exposing (view)


main : Program Flags Model Msg
main =
    Browser.element
        { init = init
        , view = view
        , update = update
        , subscriptions = subscriptions
        }


init : Flags -> ( Model, Cmd Msg )
init flags =
    ( { wallets =
            flags.xnft
                |> Maybe.map (.wallet >> List.singleton)
      , status = "..."
      , wallet =
            flags.xnft
                |> Maybe.map (\x -> { name = x.wallet.name, address = x.address })
      , connectInProgress = Nothing
      , nfts = Nothing
      , cleanupInProgress = False
      , details = Dict.empty
      , detailsInProgress = Nothing
      , view =
            if flags.xnft == Nothing then
                Types.ViewConnect False

            else
                Types.ViewNav Types.NavBurnNft
      , burnInProgress = Nothing
      , signatures = []
      , messages = []
      , burnSig = Nothing
      , screen = flags.screen
      , isXnft = flags.xnft /= Nothing
      }
    , Cmd.none
    )


subscriptions : Model -> Sub Msg
subscriptions _ =
    [ Ports.walletUpdate Types.WalletCb
    , Ports.statusUpdate Types.StatusCb
    , Ports.connectCb Types.ConnectCb
    , Ports.cleanupCb Types.CleanupCb
    , Ports.nftsCb Types.NftsCb
    , Ports.burnCb Types.BurnCb
    , Ports.fetchDetailsCb Types.FetchDetailsCb
    ]
        |> Sub.batch
