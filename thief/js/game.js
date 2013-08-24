/* global Kinetic */
/* jslint browser: true */
(function Game() {
    "use strict";

    var gameCanvas = document.createElement("canvas");
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

        img.onload = function () {
            console.log("Image loaded");
            deferred.resolve();
        };

        img.src = tileset.image;
        tileset.img = img;

        return deferred.promise();
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

    function findTileset(map, gid) {
        var tilesets = _.filter(map.tilesets, function (tileset) {
            return gid >= tileset.firstgid;
        });

        if (tilesets.length === 0) {
            return undefined;
        }

        return _.max(tilesets, function (tileset) {
            return tileset.firstgid;
        });
    }

    function drawTileLayer(map, layer, ctx) {

        for (var i = 0; i < layer.data.length; i++) {
            var gid = layer.data[i];
            var xy = toXY(i, map);

            var tileset = findTileset(map, gid);

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
    }

    function getLayer(map, name) {
        return _.find(map.layers, function (layer) {
            return layer.name === name;
        });
    }

    function drawEntity(map, entity, ctx) {
        var gid = entity.gid;
        var tileset = findTileset(map, gid);
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
                entity.x,
                entity.y,
                tileset.tilewidth,
                tileset.tileheight);
        }
    }

    $("div#container").append(gameCanvas);

    function playGame(map) {
        // Preload some stuff, so we don't need to ask everytime where stuff is
        var ctx = gameCanvas.getContext('2d');
        var bgLayer = getLayer(map, "background");
        var entLayer = getLayer(map, "entities");

        var player = {
            x: 0,
            y: 0
        }

        function loadEntities(layer) {
            player = _.find(layer.objects, function (obj) {
                return obj.type === "player";
            });
            console.log(player);
        }
        
        function renderGame() {
            drawTileLayer(map, bgLayer, ctx);
            drawEntity(map, player, ctx);
        }

        loadEntities(entLayer);

        function mainloop() {
            renderGame();
            window.requestAnimationFrame(mainloop);
        }

        mainloop();
    }

    $(document).ready(function () {
        $.getJSON("maps/demo.json", function (json) {
            loadMap(json, function (map) {
                console.log("Map loaded");
                playGame(map);
            });
        });
    });
}());
