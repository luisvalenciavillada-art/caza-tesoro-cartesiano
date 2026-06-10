(function () {
  function DefeatScene() {
    Phaser.Scene.call(this, { key: 'DefeatScene' });
  }

  DefeatScene.prototype = Object.create(Phaser.Scene.prototype);
  DefeatScene.prototype.constructor = DefeatScene;

  DefeatScene.prototype.create = function () {
    var w = this.cameras.main.width;
    var h = this.cameras.main.height;
    var self = this;

    var panel = this.add.image(w / 2, h / 2, 'pantallaDerrota');
    var ps = Math.min((w * 0.95) / panel.width, (h * 0.9) / panel.height, 1);
    panel.setScale(ps);

    var levelId = this.registry.get('levelId') || 1;

    var retry = this.add
      .text(w / 2, h * 0.66, 'Reintentar', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '24px',
        color: '#ffffff',
        backgroundColor: '#ca8a04',
        padding: { x: 24, y: 12 }
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    retry.on('pointerup', function () {
      self.scene.start('GameScene', { levelId: levelId });
    });

    var menu = this.add
      .text(w / 2, h * 0.78, 'Volver al menú', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '24px',
        color: '#ffffff',
        backgroundColor: '#2563eb',
        padding: { x: 24, y: 12 }
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    menu.on('pointerup', function () {
      self.scene.start('MainMenu');
    });
  };

  window.DefeatScene = DefeatScene;
})();
