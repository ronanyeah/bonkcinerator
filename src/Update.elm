module Update exposing (update)

import Dict
import Maybe.Extra exposing (unwrap)
import Ports
import Types exposing (..)


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    let
        ensureWallet fn =
            model.wallet
                |> unwrap ( model, Ports.log "Wallet missing" ) fn
    in
    case msg of
        Burn mintId ->
            ensureWallet
                (\wallet ->
                    ( { model
                        | burnInProgress = Just mintId
                        , view = ViewAction <| ActionBurn mintId
                      }
                    , Ports.burn
                        { mintId = mintId
                        , walletName = wallet.name
                        }
                    )
                )

        ClearAction ->
            ( { model
                | view = ViewNav NavBurnNft
                , messages = []
                , burnSig = Nothing
              }
            , Cmd.none
            )

        RefreshTokens ->
            ensureWallet
                (\wallet ->
                    ( { model
                        | nfts = Nothing
                      }
                    , Ports.refreshTokens { walletName = wallet.name }
                    )
                )

        SelectView v ->
            ( { model
                | view = v
              }
            , Cmd.none
            )

        Disconnect ->
            ( { model
                | wallet = Nothing
                , nfts = Nothing
                , view = ViewConnect False
                , messages = []
                , burnSig = Nothing
              }
            , Cmd.none
            )

        NftsCb res ->
            ( { model
                | nfts = Just res
              }
            , Cmd.none
            )

        ConnectCb addr ->
            let
                wallet =
                    Maybe.map2
                        (\name addr_ ->
                            { name = name
                            , address = addr_
                            }
                        )
                        model.connectInProgress
                        addr
            in
            ( { model
                | connectInProgress = Nothing
                , wallet = wallet
                , view =
                    if wallet == Nothing then
                        model.view

                    else
                        ViewNav NavBurnNft
              }
            , Cmd.none
            )

        WalletCb xs ->
            ( { model
                | wallets =
                    model.wallets
                        |> Maybe.withDefault []
                        |> (::) xs
                        |> Just
              }
            , Cmd.none
            )

        CleanupCb _ ->
            ( { model | cleanupInProgress = False }
            , Cmd.none
            )

        ChooseWallet ->
            ( { model | view = ViewConnect True }
            , if model.wallets == Nothing then
                Ports.fetchWallets ()

              else
                Cmd.none
            )

        Connect val ->
            ( { model | connectInProgress = Just val }
            , Ports.connect val
            )

        Cleanup ->
            ensureWallet
                (\wallet ->
                    ( { model | cleanupInProgress = True }
                    , Ports.cleanup { walletName = wallet.name }
                    )
                )

        FetchDetails mintId ->
            ensureWallet
                (\wallet ->
                    ( { model | detailsInProgress = Just mintId }
                    , Ports.fetchDetails { walletName = wallet.name, mintId = mintId }
                    )
                )

        FetchDetailsCb res ->
            ( { model
                | detailsInProgress = Nothing
                , details =
                    Maybe.map2
                        (\mintId details ->
                            model.details
                                |> Dict.insert mintId details
                        )
                        model.detailsInProgress
                        res
                        |> Maybe.withDefault model.details
              }
            , Cmd.none
            )

        BurnCb res ->
            ensureWallet
                (\_ ->
                    ( { model
                        | burnInProgress = Nothing

                        --, signatures = unwrap [] List.singleton res ++ model.signatures
                        , burnSig = res
                        , messages =
                            if res == Nothing then
                                model.messages ++ [ "❗ There was a problem." ]

                            else
                                model.messages

                        --, view =
                        --if res == Nothing then
                        --model.view
                        --else
                        --ViewNav NavHistory
                        , nfts =
                            if res == Nothing then
                                model.nfts

                            else
                                model.nfts
                                    |> Maybe.map
                                        (List.filter
                                            (\n ->
                                                model.burnInProgress /= Just n.mintId
                                            )
                                        )
                      }
                    , Cmd.none
                    )
                )

        StatusCb val ->
            ( { model
                | messages = model.messages ++ [ val ]
              }
            , Cmd.none
            )
