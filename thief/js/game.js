/* global Kinetic */
/* jslint browser: true */
(function Game() {
    "use strict";

    var gameCanvas = document.createElement("canvas");
    gameCanvas.id = "game";
    gameCanvas.width = 640;
    gameCanvas.height = 480;


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


    $("div#container").append(gameCanvas);

    function toXY(index, width) {
        return {
            x: index % width,
            y: Math.floor(index / width)
        };
    }

    function fromXY(x, y, width) {
        return y * width + x;
    }

    function appendMapMethods(map) {

        map.toXY = function (index) {
            return toXY(index, this.width);
        };

        map.fromXY = function (x, y) {
            return toXY(x, y, this.width);
        };

        map.findTileset = function(gid) {
            var tilesets = _.filter(this.tilesets, function (tileset) {
                return gid >= tileset.firstgid;
            });

            if (tilesets.length === 0) {
                return undefined;
            }

            return _.max(tilesets, function (tileset) {
                return tileset.firstgid;
            });
        };

        map.drawTileLayer = function(layer, ctx) {
            for (var i = 0; i < layer.data.length; i++) {
                var gid = layer.data[i];
                var xy = this.toXY(i);

                var tileset = this.findTileset(gid);

                if (tileset) {
                    var txy = toXY(gid - tileset.firstgid,
                            tileset.imagewidth / tileset.tilewidth);

                    ctx.drawImage(tileset.img,
                        txy.x * tileset.tilewidth,
                        txy.y * tileset.tileheight,
                        tileset.tilewidth,
                        tileset.tileheight,
                        xy.x * this.tilewidth,
                        xy.y * this.tileheight,
                        tileset.tilewidth,
                        tileset.tileheight);
                }
            }
        };

        map.drawEntity = function(entity, ctx) {
            var gid = entity.gid;
            var tileset = this.findTileset(gid);
            if (tileset) {
                var txy = toXY(gid - tileset.firstgid, 
                    tileset.imagewidth / tileset.tilewidth);

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
        };

        map.getLayer = function(name) {
            return _.find(this.layers, function (layer) {
                return layer.name === name;
            });
        };

        return map;
    }

    function playGame(map) {
        // Preload some stuff, so we don't need to ask everytime where stuff is
        var ctx = gameCanvas.getContext('2d');
        var bgLayer = map.getLayer("background");
        var entLayer = map.getLayer("entities");

        var player = {
            x: 0,
            y: 0
        }

        function loadEntities(layer) {
            player = _.find(layer.objects, function (obj) {
                return obj.type === "player";
            });

            player.map = map;
            player.moveTo = function (x, y) {
                var tileIndex = fromXY(x, y, map);

            };
        }
        
        function renderGame() {
            map.drawTileLayer(bgLayer, ctx);
            map.drawEntity(player, ctx);
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
                
                var newMap = appendMapMethods(map);
                playGame(newMap);
            });
        });
    });
}());
