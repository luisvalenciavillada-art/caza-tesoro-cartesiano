(function () {
  function VictoryScene() {
    Phaser.Scene.call(this, { key: 'VictoryScene' });
  }

  VictoryScene.prototype = Object.create(Phaser.Scene.prototype);
  VictoryScene.prototype.constructor = VictoryScene;

  VictoryScene.prototype.create = function () {
    var w = this.cameras.main.width;
    var h = this.cameras.main.height;
    var self = this;

    var panel = this.add.image(w / 2, h / 2, 'pantallaVictoria');
    var ps = Math.min((w * 0.95) / panel.width, (h * 0.9) / panel.height, 1);
    panel.setScale(ps);

    var score = this.registry.get('lastScore');
    if (score != null) {
      this.add
        .text(w / 2, h * 0.72, 'Puntos: ' + score, {
          fontFamily: 'Arial, sans-serif',
          fontSize: '22px',
          color: '#0f172a',
          backgroundColor: 'rgba(255,255,255,0.8)',
          padding: { x: 12, y: 6 }
        })
        .setOrigin(0.5);
    }

    var menu = this.add
      .text(w / 2, h * 0.86, 'Volver al menú', {
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

  window.VictoryScene = VictoryScene;
})();
