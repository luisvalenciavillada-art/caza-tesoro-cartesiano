(function () {
  function GameScene() {
    Phaser.Scene.call(this, { key: 'GameScene' });
  }

  GameScene.prototype = Object.create(Phaser.Scene.prototype);
  GameScene.prototype.constructor = GameScene;

  GameScene.prototype.init = function (data) {
    this.levelId = data && data.levelId ? data.levelId : 1;
    this.points = 0;
    this.streak = 0;
    this.wrongStreak = 0;
    this.currentTarget = null;
    this.gridMin = -10;
    this.gridMax = 10;
  };

  GameScene.prototype.create = function () {
    var self = this;
    this.registry.set('levelId', this.levelId);

    var level = window.LEVELS.find(function (l) {
      return l.id === self.levelId;
    });
    if (!level) level = window.LEVELS[0];

    var w = this.cameras.main.width;
    var h = this.cameras.main.height;

    if (level.mapKey && this.textures.exists(level.mapKey)) {
      var map = this.add.image(w / 2, h * 0.36, level.mapKey);
      var ms = Math.min((w * 0.98) / map.width, (h * 0.55) / map.height, 1);
      map.setScale(ms);
    }

    if (level.objectsKey && this.textures.exists(level.objectsKey)) {
      var obj = this.add.image(w * 0.82, h * 0.22, level.objectsKey);
      var os = Math.min((w * 0.22) / obj.width, (h * 0.22) / obj.height, 1);
      obj.setScale(os);
    }

    if (level.characterKey && this.textures.exists(level.characterKey)) {
      var ch = this.add.image(w * 0.18, h * 0.78, level.characterKey);
      var cs = Math.min((w * 0.2) / ch.width, (h * 0.35) / ch.height, 1);
      ch.setScale(cs);
    }

    if (this.textures.exists('hudJuegoGouache')) {
      var hud = this.add.image(w / 2, h - 40, 'hudJuegoGouache');
      var hs = Math.min((w * 0.95) / hud.width, 90 / hud.height, 1);
      hud.setScale(hs);
    }

    this.targetText = this.add
      .text(w / 2, h * 0.58, '', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '20px',
        color: '#0f172a',
        backgroundColor: 'rgba(255,255,255,0.75)',
        padding: { x: 12, y: 8 }
      })
      .setOrigin(0.5);

    this.statsText = this.add
      .text(w / 2, h * 0.64, '', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        color: '#1e293b'
      })
      .setOrigin(0.5);

    this.storyText = this.add
      .text(w / 2, 24, level.story || '', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '15px',
        color: '#ffffff',
        align: 'center',
        wordWrap: { width: w - 40 },
        backgroundColor: 'rgba(15,23,42,0.55)',
        padding: { x: 10, y: 6 }
      })
      .setOrigin(0.5, 0);

    this.setupGrid(w, h);

    this.nextTarget();

    this.input.keyboard.on('keydown-ESC', function () {
      if (!self.scene.isPaused('GameScene')) {
        self.scene.pause('GameScene');
        self.scene.launch('PauseScene', { gameKey: 'GameScene' });
      }
    });

    var menuBtn = this.add
      .text(w - 12, 12, 'Menú / Pausa (ESC)', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        color: '#ffffff',
        backgroundColor: '#334155',
        padding: { x: 8, y: 6 }
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    menuBtn.on('pointerup', function () {
      self.scene.pause('GameScene');
      self.scene.launch('PauseScene', { gameKey: 'GameScene' });
    });
  };

  GameScene.prototype.setupGrid = function (w, h) {
    var self = this;
    var min = this.gridMin;
    var max = this.gridMax;
    var size = max - min + 1;

    var areaW = Math.min(w * 0.92, 420);
    var areaH = areaW;
    var cell = areaW / size;
    var originX = w / 2 - areaW / 2;
    var originY = h * 0.72 - areaH / 2;

    var g = this.add.graphics();
    g.lineStyle(1, 0x94a3b8, 0.9);
    for (var i = 0; i <= size; i++) {
      var x = originX + i * cell;
      g.lineBetween(x, originY, x, originY + areaH);
      var y = originY + i * cell;
      g.lineBetween(originX, y, originX + areaW, y);
    }
    g.lineStyle(2, 0xef4444, 1);
    g.lineBetween(originX + (0 - min) * cell, originY, originX + (0 - min) * cell, originY + areaH);
    g.lineBetween(originX, originY + (max - 0) * cell, originX + areaW, originY + (max - 0) * cell);

    var zone = this.add.zone(originX, originY, areaW, areaH).setOrigin(0, 0).setInteractive();
    zone.on('pointerdown', function (pointer) {
      var lx = pointer.x - originX;
      var ly = pointer.y - originY;
      if (lx < 0 || ly < 0 || lx >= areaW || ly >= areaH) return;
      var col = Math.floor(lx / cell);
      var row = Math.floor(ly / cell);
      if (col < 0 || col >= size || row < 0 || row >= size) return;
      var gx = min + col;
      var gy = max - row;
      self.handleTap(gx, gy);
    });
  };

  GameScene.prototype.updateHud = function () {
    this.statsText.setText('Puntos: ' + this.points + '  ·  Racha: ' + this.streak);
  };

  GameScene.prototype.nextTarget = function () {
    if (typeof window.generateCoordinate === 'function') {
      this.currentTarget = window.generateCoordinate(this.levelId);
    } else {
      this.currentTarget = { x: 0, y: 0 };
    }
    var tx = this.currentTarget.x;
    var ty = this.currentTarget.y;
    this.targetText.setText('Encuentra: (' + tx + ', ' + ty + ')');
    this.updateHud();
  };

  GameScene.prototype.handleTap = function (x, y) {
    var ok = false;
    if (typeof window.checkMatch === 'function') {
      ok = window.checkMatch(x, y, this.currentTarget);
    }
    if (ok) {
      this.points++;
      this.streak++;
      this.wrongStreak = 0;
      if (this.points >= 10) {
        this.registry.set('lastScore', this.points);
        this.scene.start('VictoryScene');
        return;
      }
      this.nextTarget();
    } else {
      this.streak = 0;
      this.wrongStreak++;
      this.updateHud();
      if (this.wrongStreak >= 6) {
        this.registry.set('lastScore', this.points);
        this.scene.start('DefeatScene');
        return;
      }
    }
  };

  window.GameScene = GameScene;
})();
