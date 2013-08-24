/* global Kinetic */
/* jslint browser: true */
(function Game() {
    "use strict";


    var gameCanvas = document.createElement("canvas"),
        ctx = gameCanvas.getContext('2d');
    gameCanvas.id = "game";
    gameCanvas.width = 640;
    gameCanvas.height = 480;

    function toXY(index, map) {
        return {
            x: index % map.width,
            y: Math.floor(index / map.width)
        };
    }

    function fromXY(x, y, map) {
        return y * map.width + x;
    }

    function loadTileset(tileset) {
        var img = new Image();
        var deferred = $.Deferred();

        $(img).on("load", function () {
            deferred.resolve();
        });

        img.src = tileset.image;
        tileset.img = img;

        deferred.promise();
    }

    function loadMap(json, callback) {
        var map = json;
        var tilesetLoaders = [];

        _.each(map.tilesets, function (tileset) {
            tilesetLoaders.push(loadTileset(tileset));
        });
        
        $.when.apply(null, tilesetLoaders).done(function () {
            callback(map);
        });
    }

    function drawMap(map, ctx) {
        _.each(map.layers, function (layer) {
            for (var i = 0; i < layer.data.length; i++) {
                var gid = layer.data[i];
                var xy = toXY(i, map);

                var tileset = _.find(map.tilesets, function (tileset) {
                    return tileset.firstgid <= gid;
                });

                if (tileset) {
                    var txy = toXY(gid - tileset.firstgid, {
                        width: tileset.imagewidth / tileset.tilewidth,
                        height: tileset.imageheight / tileset.tileheight
                    });

                    ctx.drawImage(tileset.img,
                        txy.x * tileset.tilewidth,
                        txy.y * tileset.tileheight,
                        tileset.tilewidth,
                        tileset.tileheight,
                        xy.x * map.tilewidth,
                        xy.y * map.tileheight,
                        tileset.tilewidth,
                        tileset.tileheight);
                }
            }
        });
    }

    $("div#container").append(gameCanvas);

    $(document).ready(function () {
        $.getJSON("maps/demo.json", function (json) {
            loadMap(json, function (map) {
                drawMap(map, ctx);
            });
        });
    });
}());
