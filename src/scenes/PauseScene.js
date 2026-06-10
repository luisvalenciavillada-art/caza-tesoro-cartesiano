(function () {
  function PauseScene() {
    Phaser.Scene.call(this, { key: 'PauseScene' });
  }

  PauseScene.prototype = Object.create(Phaser.Scene.prototype);
  PauseScene.prototype.constructor = PauseScene;

  PauseScene.prototype.init = function (data) {
    this.gameKey = data && data.gameKey ? data.gameKey : 'GameScene';
  };

  PauseScene.prototype.create = function () {
    var w = this.cameras.main.width;
    var h = this.cameras.main.height;
    var self = this;

    this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.45);

    var panel = this.add.image(w / 2, h / 2, 'pantallaPausa');
    var ps = Math.min((w * 0.9) / panel.width, (h * 0.85) / panel.height, 1);
    panel.setScale(ps);

    var cont = this.add
      .text(w / 2, h * 0.62, 'Continuar', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '24px',
        color: '#ffffff',
        backgroundColor: '#16a34a',
        padding: { x: 24, y: 12 }
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    cont.on('pointerup', function () {
      self.scene.resume(self.gameKey);
      self.scene.stop();
    });

    var exit = this.add
      .text(w / 2, h * 0.74, 'Salir al menú', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '24px',
        color: '#ffffff',
        backgroundColor: '#dc2626',
        padding: { x: 24, y: 12 }
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    exit.on('pointerup', function () {
      self.scene.stop(self.gameKey);
      self.scene.stop();
      self.scene.start('MainMenu');
    });
  };

  window.PauseScene = PauseScene;
})();
