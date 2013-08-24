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

    function fromXY(x, y, th, tw, width) {
        return (Math.floor(y / th) * width) + Math.floor(x / tw);
    }

    function prepareMap(map) {

        map.toXY = function (index) {
            return toXY(index, this.width);
        };

        map.fromXY = function (x, y) {
            return fromXY(x, y, this.tilewidth, this.tileheight, this.width);
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
                    entity.x - (entity.width / 2),
                    entity.y - (entity.height / 2),
                    tileset.tilewidth,
                    tileset.tileheight);
            }
        };

        map.getLayer = function(name) {
            return _.find(this.layers, function (layer) {
                return layer.name === name;
            });
        };

        // Returns tile properties
        map.getTileProps = function(layer, x, y) {
            var index = this.fromXY(x, y); 
            var gid = layer.data[index];

            if (!gid) return null;
            var tileset = this.findTileset(gid);
            if (!tileset) return null;
            gid -= tileset.firstgid;

            var props = tileset.tileproperties;
            return props[gid];
        };

        return map;
    }

    function playGame(map) {
        // Preload some stuff, so we don't need to ask everytime where stuff is
        var ctx = gameCanvas.getContext('2d');
        var bgLayer = map.getLayer("background");
        var entLayer = map.getLayer("entities");
        var actions = {
            "up": false,
            "down": false,
            "left": false,
            "right": false
        };
        var keys = {
            87: "up",
            65: "left",
            83: "down",
            68: "right"
        };

        var player = {
            x: 0,
            y: 0
        };

        function loadEntities(layer) {
            player = _.find(layer.objects, function (obj) {
                return obj.type === "player";
            });

            player.map = map;
            // The origin of the player is at its center
            player.x += player.width / 2;
            player.y -= player.height / 2;

            console.log(player.y);
            player.moveTo = function (x, y) {
                var props = this.map.getTileProps(bgLayer, x, y);
                
                if (props && props.walkable === "true") {
                    this.x = x;
                    this.y = y;
                    return true;
                } else {
                    return false;
                }
            };

            player.moveRelative = function (x, y) {
                var properties;
                var speed = 1.0;
                
                properties = this.properties;
                if (properties && properties.speed) {
                    speed = properties.speed;
                }
                return this.moveTo(player.x + (x * speed), player.y + (y * speed));
            }

        }

        function processInput(dt) {
            var dx = 0, dy = 0;
            if (actions.left) {
                dx = -1;
            } else if (actions.right) {
                dx = 1;
            }

            if (actions.up) {
                dy = -1;
            } else if (actions.down) {
                dy = 1;
            }

            player.moveRelative(dx * dt, dy * dt);
        }
        
        function renderGame() {
            map.drawTileLayer(bgLayer, ctx);
            map.drawEntity(player, ctx);
        }

        loadEntities(entLayer);

        $(gameCanvas).on("click touchend", function (e) {
            var x;
            var y;
            var ev;
            e.preventDefault();

            if (e.type === "click") {
                ev = e;
            } else if (e.type == "touchend") {
                var touches = e.originalEvent.changedTouches;
                if (touches.length != 1) {
                    return false;
                }
                var touch = touches[0];

                ev = touch;
            }

            var offset = $(gameCanvas).offset();
            x = ev.pageX - offset.left;
            y = ev.pageY - offset.top;

            player.moveTo(x,y);
            return false;

        });

        $(window).on("keydown keyup", function (e) {
            var action = keys[e.keyCode];
            if (action) {
                actions[action] = (e.type == "keydown");
            }

        });

        function mainloop() {
            processInput(1.0);
            renderGame();
            if (window.requestAnimationFrame) {
                window.requestAnimationFrame(mainloop);
            } else {
                window.setTimeout(mainloop, 1000 / 60);
            }
        }

        mainloop();
    }

    $(document).ready(function () {

        $(document).on("touchmove", function(e) {
            e.preventDefault();
        }, false);

        $.getJSON("maps/demo.json", function (json) {
            loadMap(json, function (map) {
                console.log("Map loaded");
                
                var newMap = prepareMap(map);
                playGame(newMap);
            });
        });

    });
}());
