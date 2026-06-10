(function () {
  function MainMenu() {
    Phaser.Scene.call(this, { key: 'MainMenu' });
  }

  MainMenu.prototype = Object.create(Phaser.Scene.prototype);
  MainMenu.prototype.constructor = MainMenu;

  MainMenu.prototype.create = function () {
    var w = this.cameras.main.width;
    var h = this.cameras.main.height;
    var bg = this.add.image(w / 2, h / 2, 'pantallaInicioJuego');
    var scale = Math.min(w / bg.width, h / bg.height, 1);
    bg.setScale(scale);

    this.menuLayer = this.add.container(0, 0);
    this.overlayLayer = this.add.container(0, 0);
    this.overlayLayer.setDepth(100);

    this.buildMainButtons(w, h);
  };

  MainMenu.prototype.clearOverlay = function () {
    if (this.overlayLayer) {
      this.overlayLayer.removeAll(true);
    }
  };

  MainMenu.prototype.addBackButton = function (w, h) {
    var self = this;
    var back = this.add
      .text(w / 2, h - 36, 'Volver', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '22px',
        color: '#ffffff',
        backgroundColor: '#2563eb',
        padding: { x: 16, y: 8 }
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    back.on('pointerup', function () {
      self.clearOverlay();
      self.buildMainButtons(w, h);
    });
    this.overlayLayer.add(back);
  };

  MainMenu.prototype.buildMainButtons = function (w, h) {
    var self = this;
    this.clearOverlay();

    var addBtn = function (label, y, onClick) {
      var t = self.add
        .text(w / 2, y, label, {
          fontFamily: 'Arial, sans-serif',
          fontSize: '24px',
          color: '#1e293b',
          backgroundColor: 'rgba(255,255,255,0.85)',
          padding: { x: 20, y: 10 }
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      t.on('pointerup', onClick);
      self.menuLayer.add(t);
    };

    this.menuLayer.removeAll(true);

    addBtn('Jugar', h * 0.42, function () {
      var id = self.registry.get('selectedLevel');
      if (!id) id = 1;
      self.scene.start('GameScene', { levelId: id });
    });

    addBtn('Niveles', h * 0.52, function () {
      self.openLevelSelect(w, h);
    });

    addBtn('Créditos', h * 0.62, function () {
      self.openCredits(w, h);
    });

    addBtn('Ajustes', h * 0.72, function () {
      self.openSettings(w, h);
    });

    var iconY = h * 0.88;
    if (self.textures.exists('iconoSonidoGouache')) {
      var snd = self.add.image(w / 2, iconY, 'iconoSonidoGouache').setInteractive({ useHandCursor: true });
      var is = Math.min(48 / snd.width, 48 / snd.height, 1);
      snd.setScale(is);
      snd.on('pointerup', function () {
        self.sound.mute = !self.sound.mute;
      });
      self.menuLayer.add(snd);
    }
  };

  MainMenu.prototype.openLevelSelect = function (w, h) {
    var self = this;
    this.menuLayer.removeAll(true);
    this.clearOverlay();

    var panel = this.add.image(w / 2, h / 2, 'pantallaNiveles');
    var ps = Math.min((w * 0.92) / panel.width, (h * 0.88) / panel.height, 1);
    panel.setScale(ps);
    this.overlayLayer.add(panel);

    for (var i = 0; i < 4; i++) {
      var id = i + 1;
      var col = i % 2;
      var row = Math.floor(i / 2);
      var bx = w / 2 + (col - 0.5) * 140;
      var by = h / 2 + (row - 0.5) * 100;
      var b = this.add
        .text(bx, by, 'Nivel ' + id, {
          fontFamily: 'Arial, sans-serif',
          fontSize: '22px',
          color: '#ffffff',
          backgroundColor: '#0f766e',
          padding: { x: 14, y: 10 }
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      (function (levelId) {
        b.on('pointerup', function () {
          self.registry.set('selectedLevel', levelId);
          self.clearOverlay();
          self.scene.start('GameScene', { levelId: levelId });
        });
      })(id);
      this.overlayLayer.add(b);
    }

    this.addBackButton(w, h);
  };

  MainMenu.prototype.openCredits = function (w, h) {
    var self = this;
    this.menuLayer.removeAll(true);
    this.clearOverlay();

    var panel = this.add.image(w / 2, h / 2, 'pantallaCreditos');
    var ps = Math.min((w * 0.95) / panel.width, (h * 0.9) / panel.height, 1);
    panel.setScale(ps);
    this.overlayLayer.add(panel);
    this.addBackButton(w, h);
  };

  MainMenu.prototype.openSettings = function (w, h) {
    var self = this;
    this.menuLayer.removeAll(true);
    this.clearOverlay();

    var panel = this.add.image(w / 2, h / 2, 'pantallaAjustes');
    var ps = Math.min((w * 0.95) / panel.width, (h * 0.9) / panel.height, 1);
    panel.setScale(ps);
    this.overlayLayer.add(panel);

    if (this.textures.exists('iconoSonidoGouache')) {
      var ic = this.add.image(w / 2, h / 2 + 40, 'iconoSonidoGouache').setInteractive({ useHandCursor: true });
      var is = Math.min(64 / ic.width, 64 / ic.height, 1);
      ic.setScale(is);
      ic.on('pointerup', function () {
        self.sound.mute = !self.sound.mute;
      });
      this.overlayLayer.add(ic);
    }

    this.addBackButton(w, h);
  };

  window.MainMenu = MainMenu;
})();
