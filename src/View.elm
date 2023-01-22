module View exposing (view)

import BigInt
import Dict
import Element exposing (..)
import Element.Background as Background
import Element.Border as Border
import Element.Font as Font
import Element.Input as Input
import FormatNumber
import FormatNumber.Locales exposing (usLocale)
import Helpers.View exposing (cappedHeight, cappedWidth, style, when, whenAttr, whenJust)
import Html exposing (Html)
import Html.Attributes
import Img
import List.Extra
import Maybe.Extra exposing (unwrap)
import Types exposing (..)


view : Model -> Html Msg
view model =
    (if model.isSmall then
        [ bonkBoard
            |> el [ centerX ]
        , [ "Mobile/Tablet support coming soon."
                |> text
                |> el
                    [ Font.size 20
                    ]
          , twitterLink
                |> el [ centerX, Font.size 17 ]
          ]
            |> column
                [ padding 20
                , spacing 15
                , Background.color lightGold
                , Border.width 3
                , centerX
                ]
        , image [ width <| px 375, centerX ]
            { src = "/framed.png"
            , description = ""
            }
        ]
            |> column
                ([ spacing 10
                 , padding 40
                 , width fill
                 ]
                    ++ (if model.screen.height < 400 then
                            [ scale 0.4
                            , moveUp 240
                            ]

                        else if model.screen.width < 300 || model.screen.height < 500 then
                            [ scale 0.4
                            , moveUp 200
                            ]

                        else if model.screen.width < 500 || model.screen.height < 700 then
                            [ scale 0.6
                            , moveUp 150
                            ]

                        else if model.screen.width < 550 || model.screen.height < 900 then
                            [ scale 0.8
                            , moveUp 75
                            ]

                        else
                            []
                       )
                )

     else
        viewBody model
    )
        |> Element.layoutWith
            { options =
                [ Element.focusStyle
                    { borderColor = Nothing
                    , backgroundColor = Nothing
                    , shadow = Nothing
                    }
                ]
            }
            [ width fill
            , height fill
            , Background.tiled "/bg.png"
            , mainFont
            ]


bonkBoard =
    image
        [ width <| px 550
        , centerX
        , [ text "BONKCINERATOR"
                |> el
                    [ Font.size 50
                    , Font.bold
                    , Font.color <| rgb255 200 150 0
                    , padding 20
                    , Border.rounded 15
                    , titleFont
                    , Font.italic
                    , style
                        "-webkit-text-stroke"
                        "1px black"
                    ]
          , [ text "Powered by"
                |> el [ Font.size 17 ]
            , pill "Bonk" "https://www.bonkcoin.com/"
            , pill "Orca" "https://www.orca.so/"
            , pill "Helius" "https://helius.xyz/"
            ]
                |> row [ Font.color white, centerX, moveUp 10, spacing 7 ]
          ]
            |> column
                [ centerX
                , centerY
                ]
            |> inFront
        ]
        { src = "/board.png"
        , description = ""
        }


viewBody : Model -> Element Msg
viewBody model =
    [ image [ width <| px 475 ]
        { src = "/framed.png"
        , description = ""
        }
        |> el
            [ alignTop
            , paddingXY 0 40
            ]
    , [ bonkBoard
      , viewDash model
      ]
        |> column [ spacing 20, height fill, width fill ]
    ]
        |> row [ centerX, spacing 15, height fill, padding 80, fadeIn ]


pill name url =
    newTabLink
        [ hover
        , Background.color lightGold
        , Border.rounded 20
        , paddingXY 7 3
        , Border.width 1
        , Border.color black
        ]
        { url = url
        , label =
            [ image [ height <| px 25 ]
                { src = "/" ++ String.toLower name ++ ".png"
                , description = ""
                }
            , text name
                |> el [ Font.color black, Font.size 15 ]
            ]
                |> row
                    [ spacing 5
                    ]
        }


viewDash model =
    [ case model.view of
        ViewConnect ->
            [ para "Connect a wallet and start swapping unwanted tokens for $BONK"
                |> el [ Font.size 25, Font.center, width <| px 300 ]
            , model.wallets
                |> List.map
                    (\w ->
                        Input.button
                            [ hover
                                |> whenAttr (model.connectInProgress == Nothing)
                            , fade
                                |> whenAttr (model.connectInProgress /= Nothing && model.connectInProgress /= Just w.name)
                            , Font.bold
                                |> whenAttr (model.connectInProgress == Just w.name)
                            , spinner 20
                                |> el [ centerY, paddingXY 10 0 ]
                                |> onRight
                                |> whenAttr (model.connectInProgress == Just w.name)
                            ]
                            { onPress =
                                if model.connectInProgress == Nothing then
                                    Just <| Connect w.name

                                else
                                    Nothing
                            , label =
                                [ image [ height <| px 20 ] { src = w.icon, description = "" }
                                , text w.name
                                ]
                                    |> row [ spacing 10 ]
                            }
                    )
                |> column [ spacing 20, centerX ]
            , Input.button
                [ Font.italic
                , centerX
                , paddingXY 0 50
                , hover
                , Font.bold
                , Font.size 25
                ]
                { onPress = Just <| SelectView ViewFaq
                , label = text "🗒️ FAQ"
                }
            ]
                |> column [ spacing 30, centerX, paddingXY 0 30 ]

        ViewNav nav ->
            model.wallet
                |> unwrap (text "Not connected")
                    (\conn ->
                        model.wallets
                            |> List.Extra.find (\x -> x.name == conn.name)
                            |> unwrap (text "Wallet missing")
                                (\wallet ->
                                    viewNav model nav conn wallet
                                )
                    )

        ViewAction action ->
            case action of
                ActionBurn mintId ->
                    let
                        details =
                            model.details
                                |> Dict.get mintId
                    in
                    [ image [ width <| px 65, centerX ]
                        { src =
                            details
                                |> unwrap "/what.png" .img
                        , description = ""
                        }
                    , details
                        |> whenJust (.name >> text >> el [ centerX, Font.bold ])
                    , para ("You are burning " ++ String.left 15 mintId ++ "...")
                    , model.messages
                        |> List.map (para >> el [ width fill, fadeIn ])
                        |> column [ spacing 20, width fill ]
                        |> when (not (List.isEmpty model.messages))
                    , (if List.any (String.contains "problem") model.messages then
                        btn "Back" ClearAction

                       else
                        spinner 30
                      )
                        |> el [ centerX, fadeIn ]
                        |> when (model.burnSig == Nothing)
                    , model.burnSig
                        |> whenJust
                            (\sig ->
                                [ [ text "Transaction submitted:"
                                        |> el [ Font.bold ]
                                  , newTabLink [ hover, Font.underline ]
                                        { url = "https://solscan.io/tx/" ++ sig
                                        , label = text <| String.left 25 sig ++ "..."
                                        }
                                  ]
                                    |> column
                                        [ spacing 10
                                        , Background.color white
                                        , padding 15
                                        , Border.width 1
                                        ]
                                , btn "Continue" ClearAction
                                    |> el [ centerX ]
                                ]
                                    |> column
                                        [ spacing 20
                                        , fadeIn
                                        , centerX
                                        ]
                            )
                    ]
                        |> column [ spacing 20, paddingXY 0 30, width <| px 430, centerX ]
                        |> el [ height fill, width fill, scrollbarY ]

        ViewFaq ->
            [ ( "What does Bonkcinerator do?"
              , para "This app allows you to burn your unwanted tokens/NFTS, and convert the reclaimed SOL immediately into BONK."
              )
            , ( "How does the swapping work?"
              , para "The Orca SOL/BONK Whirlpool is being used to facilitate the swap."
              )
            , ( "I want to burn the BONK I receive."
              , para "This feature will be shipping soon."
              )
            , ( "Who built this?"
              , newTabLink [ hover, Font.underline ]
                    { url = "https://github.com/ronanyeah"
                    , label = text "Me."
                    }
              )
            , ( "Is this open source?"
              , newTabLink [ hover, Font.underline ]
                    { url = "https://github.com/ronanyeah/bonkcinerator"
                    , label = text "Yes."
                    }
              )

            --, ( "Why should I want BONK?"
            --, para "Look inside yourself, the answer is different for everybody."
            --)
            ]
                --|> (\xs -> xs ++ xs)
                |> List.map
                    (\( title, elem ) ->
                        [ text title
                            |> el [ Font.bold ]
                        , elem
                        ]
                            |> column [ spacing 10, width fill ]
                    )
                |> column
                    [ spacing 40
                    , width fill
                    , height fill
                    , scrollbarY
                    ]
                |> el
                    [ Input.button
                        [ Font.size 55
                        , hover
                        , Font.bold
                        , paddingXY 15 0
                        ]
                        { onPress = Just <| SelectView ViewConnect
                        , label = text "x"
                        }
                        |> el [ Font.size 40, alignTop, alignRight, fadeIn ]
                        |> inFront
                    , cappedWidth 500
                    , height fill
                    , padding 20
                    , scrollbarY
                    ]
    ]
        |> column
            [ padding 10
            , Background.gradient
                { angle = -0.3
                , steps =
                    [ lightGold

                    --, rgb255 95 54 0
                    ]
                }
            , Border.width 6
            , cappedHeight 600
            , width fill
            , Input.button
                [ hover
                , alignRight
                , paddingXY 30 20
                ]
                { onPress =
                    if model.nfts == Nothing then
                        Nothing

                    else
                        Just RefreshTokens
                , label =
                    image
                        [ width <| px 40
                        , spin
                            |> whenAttr (model.nfts == Nothing)
                        ]
                        { src = "/refresh.svg", description = "" }
                }
                |> inFront
                |> whenAttr (model.view == ViewNav NavBurnNft)
            ]
        |> el [ height fill, width fill ]


viewNav model nav conn wallet =
    [ [ [ image [ height <| px 20 ]
            { src = wallet.icon
            , description = ""
            }
        , String.left 4 conn.address
            ++ "..."
            ++ String.right 4 conn.address
            |> text
            |> el
                [ Html.Attributes.title conn.address
                    |> htmlAttribute
                , Font.size 17
                ]
        ]
            |> row [ spacing 10 ]
      , [ newTabLink [ hover, Font.underline, Font.size 15 ]
            { url = "https://solscan.io/account/" ++ conn.address
            , label = text "View your transactions"
            }
        , Input.button [ Background.color <| rgb255 230 0 0, Border.rounded 15, paddingXY 10 5, Font.size 14, hover, Font.color white ]
            { onPress = Just Disconnect
            , label = text "Disconnect"
            }
        ]
            |> row [ width fill, spaceEvenly ]
      ]
        |> column
            [ width <| px 350
            , Background.color white
            , padding 10
            , centerX
            , Border.shadow
                { blur = 10, color = black, offset = ( 2, 2 ), size = 2 }
            , fadeIn
            ]
    , [ btn "Burn tokens" (SelectView <| ViewNav NavBurnNft)
      , btn "Cleanup" (SelectView <| ViewNav NavCleanup)
      , btn "History" (SelectView <| ViewNav NavHistory)
      ]
        |> row [ centerX, spacing 20 ]
        |> when False
    , case nav of
        NavBurnNft ->
            model.nfts
                |> unwrap
                    ([ text "Fetching tokens...", spinner 30 ]
                        |> row
                            [ spacing 10
                            , centerX
                            ]
                    )
                    (\nfts ->
                        if List.isEmpty nfts then
                            [ image [ width <| px 165 ]
                                { src = "/looking.png"
                                , description = ""
                                }
                                |> el [ Border.width 3, centerX ]
                            , para "This wallet does not contain any tokens that can be burned."
                                |> el [ width <| px 300, Font.center ]
                            ]
                                |> column [ spacing 20, centerX ]

                        else
                            [ text "Select a token you want to convert to BONK"
                                |> el [ Font.bold, centerX ]
                            , nfts
                                |> List.sortBy
                                    (\n ->
                                        --n.amount
                                        n.mintId
                                    )
                                |> List.reverse
                                |> List.map (viewToken model)
                                |> column [ spacing 30, height fill, scrollbarY, width fill ]
                            ]
                                |> column [ spacing 30, height fill, width fill, fadeIn ]
                    )

        NavCleanup ->
            btnLoading model.cleanupInProgress "Cleanup" Cleanup

        NavHistory ->
            [ [ text "View your recent transactions "
              , newTabLink [ hover, Font.underline ]
                    { url = "https://solscan.io/account/" ++ conn.address
                    , label = text "here"
                    }
              , text "."
              ]
                |> paragraph []
            , model.signatures
                |> List.map
                    (\sig ->
                        newTabLink [ hover, Font.underline ]
                            { url = "https://solscan.io/tx/" ++ sig
                            , label = text <| String.left 25 sig ++ "..."
                            }
                    )
                |> column [ spacing 10 ]
            ]
                |> column [ width fill, spacing 20 ]
    ]
        |> column [ spacing 30, width fill, height fill ]


viewToken model nft =
    let
        details =
            model.details
                |> Dict.get nft.mintId

        inProg =
            model.detailsInProgress == Just nft.mintId
    in
    [ details
        |> unwrap
            (Input.button [ hover ]
                { onPress =
                    if inProg then
                        Nothing

                    else
                        Just <| FetchDetails nft.mintId
                , label =
                    image
                        ([ width <| px 65 ]
                            ++ (if inProg then
                                    [ fade
                                    , spinner 30
                                        |> el [ centerX, centerY ]
                                        |> inFront
                                    ]

                                else
                                    []
                               )
                        )
                        { src = "/what.png"
                        , description = ""
                        }
                        |> el [ clip, Border.rounded 40, Border.width 2 ]
                }
            )
            (\data ->
                image [ width <| px 65 ]
                    { src = data.img
                    , description = ""
                    }
                    |> el [ clip, Border.rounded 40, Border.width 2, fadeIn ]
            )
        |> el [ alignTop ]
    , [ [ [ details
                |> unwrap "..." .name
                |> para
                |> myLabel "Name"
          , formatAmount nft.decimals nft.amount
                |> text
                |> myLabel "Amount"
          ]
            |> column [ spacing 20, width fill ]
        , el [ width <| px 20, height fill ] none
        , [ newTabLink [ hover, Font.underline ]
                { url = "https://solscan.io/token/" ++ nft.mintId
                , label = text <| trimAddr nft.mintId
                }
                |> myLabel "Mint Address"
          , newTabLink [ hover, Font.underline ]
                { url = "https://solscan.io/token/" ++ nft.tokenAcct
                , label = text <| trimAddr nft.tokenAcct
                }
                |> myLabel "Token Account"
          ]
            |> column [ spacing 20, alignTop, width <| px 140 ]
        ]
            |> row [ width fill, spaceEvenly ]
      , [ btnLoading inProg "🔍 Fetch metadata" (FetchDetails nft.mintId)
            |> when (details == Nothing)
        , btn "🔥 Burn" (Burn nft.mintId)
            |> el [ alignRight ]

        --, details
        --|> whenJust
        --(\deets ->
        --"🔥 "
        --++ String.fromInt deets.burnRating
        --++ "/25"
        --|> text
        --)
        ]
            |> row
                [ width fill
                , spaceEvenly
                ]
      ]
        |> column [ spacing 20, width fill ]
    ]
        |> row
            [ spacing 20
            , width fill
            , centerX
            , Background.color white
            , padding 20
            , Border.width 1
            ]


myLabel tp btm =
    [ text tp
        |> el [ Font.bold ]
    , btm
    ]
        |> column [ spacing 5, width fill ]


spinner : Int -> Element msg
spinner n =
    Img.notch n
        |> el [ spin ]


spin : Attribute msg
spin =
    style "animation" "rotation 0.7s infinite linear"


fadeIn : Attribute msg
fadeIn =
    style "animation" "fadeIn 1.5s"


btnLoading loading txt msg =
    btn_ txt
        (if loading then
            Nothing

         else
            Just msg
        )
        |> el
            [ spinner 20
                |> el [ centerY, paddingXY 10 0 ]
                |> onRight
                |> whenAttr loading

            --, style "cursor" "wait"
            ]


white : Color
white =
    rgb255 255 255 255


black : Color
black =
    rgb255 0 0 0


btn txt =
    Just >> btn_ txt


btn_ txt msg =
    Input.button
        [ if msg == Nothing then
            fade

          else
            hover
        , padding 10
        , Border.width 2
        , Background.color lightGold
        , Border.shadow
            { blur = 1, color = black, offset = ( 1, 1 ), size = 1 }
        ]
        { onPress = msg
        , label = text txt
        }


hover : Attribute msg
hover =
    Element.mouseOver [ fade ]


fade : Element.Attr a b
fade =
    Element.alpha 0.6


formatInt =
    toFloat
        >> FormatNumber.format
            { usLocale | decimals = FormatNumber.Locales.Exact 2 }


formatFloat =
    FormatNumber.format
        { usLocale | decimals = FormatNumber.Locales.Max 2 }


formatAmount decimals amt =
    BigInt.fromIntString amt
        |> unwrap amt
            (\val ->
                --BigInt.div val (BigInt.fromInt (10 ^ clamp 0 infinity (decimals - 3)))
                --infinity =
                --1 // 0
                val
                    |> BigInt.toString
                    |> String.toInt
                    |> unwrap "oops"
                        (\n ->
                            toFloat n
                                / toFloat (10 ^ decimals)
                                |> formatFloat
                        )
            )


twitterLink =
    newTabLink [ hover, Background.color white, padding 5, Border.rounded 15, paddingXY 10 5 ]
        { url = "https://twitter.com/bonkcinerator"
        , label =
            [ Img.twitter 17
            , text "@bonkcinerator"
            ]
                |> row [ spacing 5 ]
        }


trimAddr addr =
    String.left 4 addr
        ++ "..."
        ++ String.right 4 addr


para txt =
    [ text txt ]
        |> paragraph []


titleFont =
    Font.family [ Font.typeface "Charm" ]


mainFont =
    Font.family [ Font.typeface "Open Sans" ]


lightGold =
    rgb255 255 208 138
