module Img exposing (notch, twitter)

import Element exposing (Element)
import Svg exposing (Svg, svg)
import Svg.Attributes exposing (d, fill, height, viewBox)


twitter : Int -> Element msg
twitter size =
    svg
        [ viewBox "0 0 248 204"
        , height <| String.fromInt size
        ]
        [ Svg.path
            [ fill "#1d9bf0", d "m222 51.3.1 6.5c0 66.8-50.8 143.7-143.7 143.7A143 143 0 0 1 1 178.8a101.4 101.4 0 0 0 74.7-21 50.6 50.6 0 0 1-47.1-35 50.3 50.3 0 0 0 22.8-.8 50.5 50.5 0 0 1-40.5-49.5v-.7c7 4 14.8 6.1 22.9 6.3A50.6 50.6 0 0 1 18 10.7a143.3 143.3 0 0 0 104.1 52.8 50.5 50.5 0 0 1 86-46c11.4-2.3 22.2-6.5 32.1-12.3A50.7 50.7 0 0 1 218.1 33c10-1.2 19.8-3.9 29-8-6.7 10.2-15.3 19-25.2 26.2z" ]
            []
        ]
        |> wrap


notch size =
    svg
        [ viewBox "0 0 512 512"
        , height <| String.fromInt size
        ]
        [ Svg.path
            [ fill "black"
            , d "M288 39.056v16.659c0 10.804 7.281 20.159 17.686 23.066C383.204 100.434 440 171.518 440 256c0 101.689-82.295 184-184 184-101.689 0-184-82.295-184-184 0-84.47 56.786-155.564 134.312-177.219C216.719 75.874 224 66.517 224 55.712V39.064c0-15.709-14.834-27.153-30.046-23.234C86.603 43.482 7.394 141.206 8.003 257.332c.72 137.052 111.477 246.956 248.531 246.667C393.255 503.711 504 392.788 504 256c0-115.633-79.14-212.779-186.211-240.236C302.678 11.889 288 23.456 288 39.056z"
            ]
            []
        ]
        |> wrap


wrap : Svg msg -> Element msg
wrap =
    Element.html
        >> Element.el []
