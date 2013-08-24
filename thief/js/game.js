/* global Kinetic */
/* jslint browser: true */
(function Game() {
    "use strict";
    var stage = new Kinetic.Stage({
            container: 'container',
            width: 578,
            height: 200
        });
    var layer = new Kinetic.Layer();
    var thief = new Image();

    thief.onload = function () {
        var sprite = new Kinetic.Image({
            x: 200,
            y: 50,
            image: thief,
            width: 32,
            height: 32
        });

        layer.add(sprite);
        stage.add(layer);
    };

    thief.src = "entities/thief.png";

}());
