/* global Kinetic */
/* jslint browser: true */
(function Game() {
    "use strict";

    var gameCanvas = document.createElement("canvas");
    gameCanvas.id = "game";
    function updateWidth() {
        gameCanvas.width = $(window).width();
        gameCanvas.height = $(window).height();
    }

    function loadTileset(tileset) {
        var img = new Image();
        var deferred = $.Deferred();

        img.onload = function () {
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
                        Math.floor(xy.x * this.tilewidth),
                        Math.floor(xy.y * this.tileheight),
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
                    Math.floor(entity.x - (entity.width / 2)),
                    Math.floor(entity.y - (entity.height / 2)),
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
        var quit = false;
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

        var player = {};
        var treasure = {};
        var guards = [];

        var camera = {
            offx: 0,
            offy: 0
        }

        function prepareEntity(entity, map) {
            entity.map = map;
            // The origin of every entity is at its center
            entity.x += entity.width / 2;
            entity.y -= entity.height / 2;
            entity.start = {
                x: entity.x,
                y: entity.y
            }
            entity.target = undefined;
            entity.wallHit = false;

            entity._reset = function () {
                this.x = this.start.x;
                this.y = this.start.y;
                this.target = undefined;
                this.wallHit = false;
            }

            entity.reset = function () {
                this._reset();
            }

            entity._update = function (dt) {
                if (this.target === undefined) {
                    return;
                }
                var speed = this.properties.speed;

                var tx = this.target.x;
                var ty = this.target.y;

                var angle = Math.atan2(ty - this.y, tx - this.x);

                var nx = this.x + speed * Math.cos(angle) * dt;
                var ny = this.y + speed * Math.sin(angle) * dt;

                this.wallHit = !this.moveTo(nx, ny);

                var sdt = speed * dt;

                if ((
                    this.x > (tx - sdt) && this.x < (tx + sdt) &&
                    this.y > (ty - sdt) && this.y < (ty + sdt)
                )) {

                   this.target = undefined;
                }
            }

            entity.update = function (dt) {
                this._update(dt);
            }

            entity.moveTo = function (x, y) {
                var props = this.map.getTileProps(bgLayer, x, y);
                
                if (props && props.walkable === "true") {
                    this.x = x;
                    this.y = y;
                    return true;
                } else {
                    return false;
                }
            };

            entity.moveRelative = function (x, y) {
                var properties;
                var speed = 1.0;
                
                properties = this.properties;
                if (properties && properties.speed) {
                    speed = properties.speed;
                }
                this.setTarget(this.x + (x * speed), this.y + (y * speed));
            }

            entity.setTarget = function (x, y) {
                this.target = {x: x, y: y};
            }

            entity.collide = function (other) {
                var mw2 = this.width / 2;
                var mh2 = this.height / 2;
                
                var ow2 = other.width / 2;
                var oh2 = other.height / 2;

                var myCorners = [
                    {x: this.x - mw2, y: this.y - mh2}, // TL
                    {x: this.x + mw2, y: this.y - mh2}, // TR
                    {x: this.x - mw2, y: this.y + mh2}, // BL
                    {x: this.x + mw2, y: this.y + mh2}  // BR
                ];

                var ret = _.all(myCorners, function (corner) {
                    var xOK = (corner.x < (other.x - ow2) || corner.x > (other.x + ow2));
                    var yOK = (corner.y < (other.y - oh2) || corner.y > (other.y + oh2));

                    return xOK || yOK;
                });

                return !ret; 
            }

            entity.hasHitWall = function () {
                var ret = this.wallHit;
                this.wallHit = false;
                return ret;
            }

            return entity;
        }

        function prepareGuard(entity, map) {
            var guard = prepareEntity(entity, map);

            guard.update = function (dt) {
                if (this.target === undefined || this.hasHitWall()) {
                    var dir = Math.floor(Math.random() * 4);
                    var amt = Math.floor(Math.random() * 200);
                    
                    switch (dir) {
                    case 0:
                        this.setTarget(this.x + amt, this.y);
                        break;
                    case 1:
                        this.setTarget(this.x - amt, this.y);
                        break;
                    case 2:
                        this.setTarget(this.x, this.y + amt);
                        break;
                    case 3:
                        this.setTarget(this.x, this.y - amt);
                        break;
                    }
                }
                
                this._update(dt);
            }

            return guard;
        }

        function preparePlayer(entity, map) {
            var player = prepareEntity(entity, map);

            player.reset = function () {
                this.treasures = 0;
                this._reset();
            }

            player.reset();
            return player;
        }

        function prepareTreasure(entity, map) {
            var treasure = prepareEntity(entity, map);
            treasure.isOpen = false;
            treasure.properties.closedgid = treasure.gid;
            
            treasure.reset = function () {
                this.isOpen = false;
                this.gid = treasure.properties.closedgid;
                this._reset();
            }

            treasure.open = function (player) {
                if (this.isOpen) return;
                this.gid = this.properties.opengid;
                player.treasures = 1;
                this.isOeon = true;
            }
            return treasure;
        }

        function loadEntities(layer) {
            player = _.find(layer.objects, function (obj) {
                return obj.type === "player";
            });

            treasure = _.find(layer.objects, function (obj) {
                return obj.type === "treasure";
            });

            var guards_ = _.select(layer.objects, function (obj) {
                return obj.type === "guard";
            });

            player = preparePlayer(player, map);
            treasure = prepareTreasure(treasure, map);

            guards = _.map(guards_, function (guard) {
                return prepareGuard(guard, map);
            });
        }

        function restartLevel(layer) {
            player.reset();
            treasure.reset();
            _.each(guards, function (guard) {
                guard.reset();
            });
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

            if (dx != 0 || dy != 0) {
                player.moveRelative(dx * dt, dy * dt);
            }
        }

        function processLogic(dt) {
            /* Update camera */
            var toFollow = player;
            camera.offx = (gameCanvas.width / 2) - toFollow.x;
            camera.offy = (gameCanvas.height / 2) - toFollow.y

            player.update(dt);
            _.each(guards, function (guard) {
                guard.update(dt);
            });

            if (player.collide(treasure)) {
                treasure.open(player);
            }
            
            /* Check if any guard hit the thief */
            var guards_ = _.filter(guards, function (guard) {
                return player.collide(guard);
            }); 

            if (guards_.length > 0) {
                restartLevel();
                return;
            }

            /* Check if thief is on exit */
            var props = map.getTileProps(bgLayer, player.x, player.y);
            if (props && props.isexit && props.isexit === "true") {
                $("#debug").html("you're exiting with " + player.treasures + " treasures!");
                quit = true;
                changeLevel(map.properties.nextmap);
            };
        }
        
        function renderGame() {
            gameCanvas.width = gameCanvas.width;
            
            ctx.save();
            ctx.translate(camera.offx, camera.offy);

            map.drawTileLayer(bgLayer, ctx);
            map.drawEntity(treasure, ctx);
            _.each(guards, function (guard) {
                map.drawEntity(guard, ctx);
            });

            map.drawEntity(player, ctx);

            ctx.restore();
        }

        loadEntities(entLayer);

        $(gameCanvas).on("mouseup touchend", function (e) {
            var x;
            var y;
            var ev;
            e.preventDefault();

            if (e.type === "mouseup") {
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
            x = ev.pageX - offset.left - camera.offx;
            y = ev.pageY - offset.top - camera.offy;

            player.setTarget(x, y);

            return false;
        });

        $(window).on("keydown keyup", function (e) {
            var action = keys[e.keyCode];
            if (action) {
                actions[action] = (e.type == "keydown");
            }
        });

        var lastUpdate = new Date().getTime();
        function mainloop() {
            var curTime = new Date().getTime();
            var dt = (curTime - lastUpdate) / 60;

            processInput(dt);
            processLogic(dt);
            renderGame();

            lastUpdate = new Date().getTime();
            if (!quit) {
                if (window.requestAnimationFrame) {
                    window.requestAnimationFrame(mainloop);
                } else {
                    window.setTimeout(mainloop, 1000 / 60);
                }
            }
        }

        mainloop();
    }

    function changeLevel(filename) {
        $.getJSON("maps/" + filename, function (json) {
            loadMap(json, function (map) {
                console.log("Map loaded");
                
                var newMap = prepareMap(map);
                playGame(newMap);
            });
        });
    }

    $(document).ready(function () {
        $(document).on("touchmove", function(e) {
            e.preventDefault();
        }, false);
        changeLevel("demo.json");
    });

    $(window).on("resize", updateWidth);
    updateWidth();
}());
