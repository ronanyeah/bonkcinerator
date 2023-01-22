module Types exposing (..)

import Dict exposing (Dict)


type alias Model =
    { wallets : List Wallet
    , status : String
    , wallet : Maybe Connection
    , detailsInProgress : Maybe String
    , connectInProgress : Maybe String
    , burnInProgress : Maybe String
    , cleanupInProgress : Bool
    , nfts : Maybe (List Token)
    , details : Dict String Details
    , view : View
    , signatures : List String
    , messages : List String
    , burnSig : Maybe String
    , isSmall : Bool
    , screen : Screen
    }


type alias Flags =
    { screen : Screen
    }


type alias Screen =
    { width : Int
    , height : Int
    }


type Action
    = ActionBurn String


type View
    = ViewConnect
    | ViewNav Nav
    | ViewAction Action
    | ViewFaq


type Nav
    = NavBurnNft
    | NavCleanup
    | NavHistory


type alias Details =
    { img : String
    , name : String
    , burnRating : Int
    }


type alias Token =
    { mintId : String
    , tokenAcct : String
    , amount : String
    , decimals : Int
    }


type alias Wallet =
    { name : String
    , icon : String
    }


type alias Connection =
    { name : String
    , address : String
    }


type Msg
    = Burn String
    | BurnCb (Maybe String)
    | WalletCb Wallet
    | Connect String
    | ConnectCb (Maybe String)
    | StatusCb String
    | FetchDetails String
    | Disconnect
    | Cleanup
    | CleanupCb (Maybe String)
    | FetchDetailsCb (Maybe Details)
    | NftsCb (List Token)
    | SelectView View
    | ClearAction
    | RefreshTokens
