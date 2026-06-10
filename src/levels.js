import { getPlaneMetrics } from './logic.js';

/**
 * GUÍA DE NOMBRES (doblaje latino de Inspector Gadget):
 *  · Sabiondo  — el perro de Penny (Brain en inglés; claves internas siguen como 'sultan').
 *  · Dr. Garra — el villano (Dr. Claw); también «Garra de M.A.D.».
 *  · M.A.D.    — organización criminal dirigida por el Dr. Garra.
 *  · Secuaces  — agentes de M.A.D. (tipo interno 'secuazDeMad').
 *
 * Usar estos nombres en todos los textos visibles (diálogos, avisos, historias).
 */
window.LEVELS = [
  {
    id: 1,
    name: 'Nivel 1 · El Bosque',
    description: 'Cuadrante I — coordenadas positivas',
    story:
      'Gadget se adelantó al Bosque del Plano y Penny va en su busca. Un lobo gris vigila uno de los caminos; hay que aprender a leer coordenadas positivas para seguir su rastro.',
    objetivos: [
      'Reconocer el eje x (horizontal) y el eje y (vertical).',
      'Leer pares ordenados (x, y) con números positivos.',
      'Identificar el origen de coordenadas y calcular una diferencia de alturas usando la coordenada y.',
      'Encontrar la pista de Gadget en el cofre antes de que se acaben los pasos del tramo final.'
    ],
    victoryPuente:
      '¡Cofre encontrado! Dentro hay una nota de Gadget: «Sigo hacia las Montañas, al oeste del origen». Penny debe seguirlo.',
    tareas: [
      {
        desc: 'Acércate al lobo sin tocarlo.',
        meta: { tipo: 'vecino', x: 5, y: 5, marcador: false },
        pregunta: {
          titulo: '🐺 El lobo en el sendero',
          texto: '«¡Penny! ¿Cuál es el eje x?»',
          opciones: ['El vertical (sube y baja)', 'El horizontal (izquierda y derecha)'],
          correcta: 1,
          pista: 'El eje x es el que va de izquierda a derecha, como las filas del suelo.'
        },
        sonidoExito: 'ladrido_perro',
        sonidoExitoRepeticiones: 3
      },
      {
        desc: 'Acércate a Sabiondo. Te dará una consigna.',
        /* ocultarLabel: true → el círculo amarillo señala a la mosca para que el
           niño sepa qué insecto mirar, pero no se muestra "(2, 9)" para que
           él lea la altura por sí mismo en el eje y. */
        meta: { tipo: 'vecino', x: 2, y: 2, marcador: { x: 2, y: 9, ocultarLabel: true } },
        dockAyuda: 'Mirá la mosca señalada y leé su altura en el eje y.',
        aviso: {
          titulo: '🐶 Sabiondo te llama',
          texto:
            'Sabiondo: «¡Eh, Penny! Una mosca robot de Garra de M.A.D. zumba sobre el mapa. ' +
            'Necesito la coordenada para eliminar esta molesta plaga antes de que siga esparciendo el virus del sueño. ' +
            'Mira hacia arriba en el plano y fíjate bien en la altura de la mosca.»',
          botonLabel: '¡Voy a fijarme! 👀',
          sonido: 'mosca_aviso',
          sonidoRepeticiones: 3,
          focosCoordenadas: [{ x: 2, y: 9 }, { x: 2, y: 2 }]
        },
        pregunta: {
          texto:
            'Sabiondo: «Rápido, Penny: dime la coordenada y (la altura) de la mosca para desactivarla.»',
          opciones: ['7', '8', '9', '10'],
          correcta: 2,
          pista: 'La ordenada es la y: desde el círculo amarillo de la mosca sigue la línea horizontal hasta el eje y y lee el número.',
          focosCoordenadas: [{ x: 2, y: 9 }, { x: 2, y: 2 }]
        },
        accion: { tipo: 'volarObjeto', x: 2, y: 9, tipos: ['mosca'] }
      },
      {
        desc: 'Ve hasta Bombeitor. Te hará dos pregunticas sobre la roca roja.',
        /* ocultarLabel: true → solo el círculo amarillo señala la roca,
           sin mostrar "(3, 3)" (la coordenada será la 2ª pregunta). */
        meta: { tipo: 'vecino', x: 7, y: 3, marcador: { x: 3, y: 4, ocultarLabel: true } },
        dockAyuda: 'Llegá hasta Bombeitor sin pisarlo. El círculo marca la roca roja.',
        aviso: {
          titulo: '🪨 Bombeitor te llama',
          texto:
            'Bombeitor: «¡Hola, Penny! Tengo lista la dinamita para esa roca rojiza. Antes de volarla, te haré dos pregunticas. Si aciertas las dos, ¡la mando por los aires!»',
          botonLabel: '¡Vamos a las pregunticas! 🧠'
        },
        pregunta: {
          texto:
            'Bombeitor (1ª): «Mira esa roca rojiza: tiene ese color por el óxido de hierro que la cubre. ¿Sabes cómo se llama?»',
          opciones: ['Granito', 'Arenisca roja', 'Caliza', 'Basalto'],
          correcta: 1,
          pista: 'La roca con óxido de hierro y color rojizo es la arenisca roja.'
        },
        encadenarSiguiente: true
      },
      {
        desc: 'Dile a Bombeitor las coordenadas de la roca para volarla.',
        /* ocultarLabel: true → el círculo amarillo señala la roca pero NO muestra
           el "(3, 3)" encima, así el estudiante debe leerlo del plano. */
        meta: { tipo: 'vecino', x: 7, y: 3, marcador: { x: 3, y: 4, ocultarLabel: true } },
        dockAyuda: 'Leé en el plano el par (x, y) de la roca marcada.',
        aviso: {
          titulo: '🪨 Bombeitor — apuntar la dinamita',
          texto:
            'Bombeitor: «¡Claro que es arenisca roja! Ahora decime el par ordenado (x, y) de esa roca ' +
            'para apuntar bien la dinamita. Primero x, después y, leyendo los ejes.»',
          botonLabel: '¡Leo el par ordenado! 🎯'
        },
        pregunta: {
          texto:
            'Bombeitor (2ª): «¡Perfecto! Ahora dime el par ordenado (x, y) de la roca para apuntar bien la dinamita.»',
          opciones: ['(2, 4)', '(3, 4)', '(3, 5)', '(4, 4)'],
          correcta: 1,
          pista: 'Mira el círculo amarillo: cuenta primero x (horizontal) y después y (vertical) usando las marcas de los ejes.'
        },
        accion: { tipo: 'explotarObjeto', x: 3, y: 4, tipos: ['rocaroja', 'dinamita'] }
      },
      {
        desc: 'Llegá al origen del plano.',
        meta: { tipo: 'casilla', x: 0, y: 0, marcador: { x: 0, y: 0, ocultarLabel: true } },
        facingOnArrival: 'derecha',
        dockAyuda: 'Donde se juntan el 0 del eje x y el 0 del eje y. Bombeitor dejó un telescopio para una pregunta más.',
        aviso: {
          titulo: '🔭 En el origen',
          texto:
            'Bombeitor: «Justo acá, en el origen, dejé un telescopio. Si lo mirás, podés orientarte en el mapa. Contestame una cosa sobre lo que ves.»',
          botonLabel: '¡Listo! 🔭',
          modalPrefer: 'left',
          modalWidthRatio: 0.64,
          focosCoordenadas: [{ x: 0, y: 6 }, { x: 7, y: 9 }, { x: 1, y: 1 }, { x: 0, y: 0 }]
        },
        pregunta: {
          texto:
            'Bombeitor: «Mira por el telescopio: el búho está en (0, 6) y el cofre en (7, 9). ¿Cuál es la diferencia de altura (en el eje y) entre el cofre y el búho?»',
          opciones: ['1', '2', '3', '4'],
          correcta: 2,
          pista:
            'La altura es la y. Resta la y del cofre menos la y del búho: 9 − 6 = ?',
          modalPrefer: 'left',
          focosCoordenadas: [{ x: 0, y: 6 }, { x: 7, y: 9 }, { x: 1, y: 1 }]
        },
        /* Aviso post-acierto: Bombeitor avisa del cronómetro de pasos
           justo antes de salir corriendo. */
        avisoExito: {
          titulo: '⏱️ ¡Pilas con los pasos!',
          texto:
            'Bombeitor: «¡Genial, son 3 casillas de diferencia! Ahora corre por el cofre, pero ojo: a partir de aquí tus pasos están contados. Tienes 16 movimientos para llegar… ¡no los desperdicies, Penny!»',
          botonLabel: '¡Voy con cuidado! 🏃‍♀️',
          sonido: 'cronometro'
        },
        /* Al cerrar el aviso, Bombeitor se despide y sale corriendo
           (su misión cumplida) y se activan los 16 pasos para llegar al cofre. */
        accion: [
          { tipo: 'retirarObjeto', x: 7, y: 3, tipos: ['bombeitor'] },
          { tipo: 'iniciarLimitePasos', pasos: 16 }
        ]
      },
      {
        desc: '¡Ve al cofre! Puede haber una pista de Gadget.',
        meta: { tipo: 'cofre', ocultarLabel: true },
        dockAyuda: 'Casi al llegar: pensá antes de moverte, no te quedan muchos pasos.',
        aviso: {
          titulo: '📜 La nota en el cofre',
          texto:
            'Dentro hay un papel. «Sigo hacia las Montañas, al oeste del origen» —firmado, tío Gadget. ¡Así que se fue para allá!',
          botonLabel: 'Siguiente'
        },
        pregunta: {
          texto: '¿Cuál es la coordenada (x, y) del cofre?',
          opciones: ['(6, 9)', '(7, 9)', '(7, 10)', '(6, 10)'],
          correcta: 1,
          pista:
            'Contá en el mapa: primero cuánto avanzaste en horizontal y después en vertical hasta el cofre.'
        }
      }
    ],
  /* Plano 8×12 (x 0…+7, y 0…+11): rejilla y etiquetas coinciden; más hueco abajo para diálogo. */
    xMin: 0,
    xMax: 7,
    yMin: 0,
    yMax: 11,
    decimals: false,
    mapKey: 'mapaBosqueIlustrado',
    playHint:
      'Acércate a quien marca la misión sin pisar su casilla. Las preguntas y textos largos van en el panel de abajo.',
    characterKey: 'explorer',
    objectsKey: 'objetosJuegoGouache'
  },
  {
    id: 2,
    name: 'Nivel 2 · Las Montañas',
    description: 'Cuadrante II — al oeste del origen (x negativa)',
    story:
      'Penny: «Tío Gadget no responde…» Las Montañas del Plano esconden señales al oeste del origen. Sir Vectorius cartografiaba el cuadrante II cuando apareció un Secuaz de M.A.D. —brazo de la organización del Dr. Garra— que dejó pistas falsas y el sombrero de Gadget como trampa.',
    objetivos: [
      'Responder a Sir Vectorius sobre el cuadrante II y la distancia en el eje x.',
      'Recuperar el sombrero de Gadget y enfrentar al Secuaz de M.A.D.',
      'Seguir la recta x = −5 antes de acorralar al Secuaz, la trampa en (−4, 5) y bajar en el eje y.',
      'Llegar a (0, 3) y subir por el eje y hasta el cofre antes de quedarte sin pasos.'
    ],
    victoryPuente:
      '¡Misión cumplida en las Montañas! Penny sigue buscando a su tío Gadget: el Secuaz apuntó al desierto del este. La historia sigue…',
    tareas: [
      {
        desc: 'Habla con Sir Vectorius en el observatorio.',
        meta: { tipo: 'vecino', x: 1, y: 2, marcador: false },
        aviso: {
          titulo: '⛰️ Sir Vectorius',
          texto:
            'Sir Vectorius: «Así que tú eres Penny… Tu tío Gadget entró al cuadrante II hace horas.»\n\n' +
            'Penny: «¿Dónde está?»\n\n' +
            'Sir Vectorius: «No lo sé con certeza… pero si respondes bien, te señalaré el camino.»',
          botonLabel: '¡Pregunta, Sir! 🧭'
        },
        encadenarSiguiente: true
      },
      {
        desc: 'Responde a Sir Vectorius.',
        meta: { tipo: 'vecino', x: 1, y: 2, marcador: false },
        pregunta: {
          texto:
            'Sir Vectorius: «¿Verdadero o falso? En el cuadrante II, ¿todas las coordenadas tienen ordenada (altura) positiva?»',
          opciones: ['Verdadero', 'Falso'],
          correcta: 0,
          pista:
            'En el cuadrante II estás por encima del eje x: la y —la altura en el mapa— siempre es mayor que cero.'
        },
        encadenarSiguiente: true
      },
      {
        desc: 'Sir Vectorius · señal peligrosa',
        meta: { tipo: 'vecino', x: 1, y: 2, marcador: false },
        aviso: {
          titulo: '⛰️ Sir Vectorius',
          texto:
            'Sir Vectorius: «¡Exacto, Penny!»\n\n' +
            '«Escucha bien: en el cuadrante II las X son negativas y las Y son positivas.»\n\n' +
            '«Detecté una señal peligrosa hacia el oeste…»',
          botonLabel: 'Continuar ›'
        },
        encadenarSiguiente: true
      },
      {
        desc: 'Responde a Sir Vectorius.',
        meta: { tipo: 'vecino', x: 1, y: 2, marcador: false },
        pregunta: {
          texto:
            'Sir Vectorius: «Estoy en x = +1 y el sombrero de Gadget está en\nx = −3. ¿Qué distancia hay entre esas dos coordenadas x?»',
          opciones: ['2 casillas', '3 casillas', '4 casillas', '5 casillas'],
          correcta: 2,
          guiaEjes: {
            cimaY: 4,
            verticales: [
              { x: 1, color: 0x2563eb },
              { x: -3, color: 0xf97316 }
            ]
          }
        },
        encadenarSiguiente: true
      },
      {
        desc: 'Ve al sombrero de Gadget.',
        meta: {
          tipo: 'vecino',
          x: 1,
          y: 2,
          marcador: { x: -3, y: 4, ocultarLabel: true }
        },
        aviso: {
          titulo: '⛰️ Sir Vectorius',
          texto:
            'Sir Vectorius: «¡Muy bien! La señal apunta a (−3, 4).»\n\n' +
            '«Ve por el sombrero de Gadget: allí habrá más pistas. ¡Go, go, Gadget!»',
          botonLabel: '¡Voy al sombrero! 🎩'
        }
      },
      {
        desc: 'Habla con Sabiondo. Rastrea huellas en el sombrero (−3, 4).',
        meta: { tipo: 'vecino', x: -3, y: 4, marcador: true, ocultarLabel: true },
        aviso: {
          titulo: '🐶 Sabiondo rastrea',
          paginas: [
            'Sabiondo: «Algo huele mal por aquí… Espera, Penny.»\n\n' +
              '«Déjame seguir el rastro un momento.»',
            'Sabiondo: «¡Mira! Por allí está el Secuaz… ¡y las moscas no paran de zumbar!»'
          ],
          cambioSprite: {
            enPagina: 1,
            textura: 'sultan3',
            x: -3,
            y: 4,
            tipoObjeto: 'sultanRastreo'
          },
          sonidoPagina: {
            enPagina: 1,
            sonido: 'enjambre_de_moscas',
            sonidoRepeticiones: 2
          },
          botonLabel: '¡Voy a investigar!'
        },
        sonidoExito: 'ladrido_perro',
        sonidoExitoRepeticiones: 1
      },
      {
        desc: 'Recoge el sombrero de Gadget en (−3, 4).',
        meta: { tipo: 'casilla', x: -3, y: 4, marcador: true, ocultarLabel: true },
        facingOnArrival: 'izquierda',
        aviso: {
          titulo: '🎩 ¡El sombrero de Gadget!',
          paginas: [
            /* No repetir el zumbido: Sabiondo ya lo dijo en la escena anterior. */
            'Penny: «¡Es el sombrero del tío Gadget!»\n\n' +
              '«Está tirado como señal… Tío, si estás cerca, ¡contesta!»',
            'Sir Vectorius: «Penny… aléjate de esa zona. Esas moscas de M.A.D. no son normales.»'
          ],
          sonidoPagina: {
            enPagina: 0,
            sonido: 'enjambre_de_moscas',
            sonidoRepeticiones: 2
          },
          botonLabel: '¡Qué zumbido…!'
        },
        accion: { tipo: 'retirarObjeto', x: -3, y: 4, tipos: ['sombrero'] },
        encadenarSiguiente: true
      },
      {
        desc: 'Responde a Sir: ¿qué esparcen las moscas de M.A.D.?',
        meta: { tipo: 'casilla', x: -3, y: 4, marcador: false },
        pregunta: {
          texto:
            'Sir Vectorius: «Penny, ¿recuerdas cómo estaba tu tío, bien agripado?»\n\n' +
            '«Con estas moscas de M.A.D. zumbaron cerca… ahora dime: ¿qué esparcen?»',
          opciones: [
            'El virus del sueño',
            'Confeti de cumpleaños',
            'Medallas de oro',
            'Mapas del tesoro'
          ],
          correcta: 0,
          pista:
            'Acabas de oír a Sir: las moscas infectadas transmiten el virus del sueño y contaminan el aire.'
        },
        sonidoExito: 'ladrido_perro',
        sonidoExitoRepeticiones: 2,
        encadenarSiguiente: true
      },
      {
        desc: 'Ubícate en la recta vertical x = −5 (rumbo del Secuaz).',
        meta: { tipo: 'rectaX', x: -5 },
        guiaMision: {
          alturaCompleta: true,
          verticales: [{ x: -5, color: 0xf97316 }]
        },
        pregunta: {
          texto:
            'En la recta vertical x = −5, todas las casillas de esa columna comparten el mismo valor de x. ¿Qué valor tienen todas?',
          opciones: ['Siempre −5', 'Siempre 0', 'Siempre positiva'],
          correcta: 0,
          pista: 'Todas las casillas de esa columna comparten la misma x: −5.'
        }
      },
      {
        desc: '¡Persigue al Secuaz hacia el oeste!',
        meta: { tipo: 'vecino', x: -7, y: 5, marcador: false },
        aviso: {
          titulo: '🪰 ¡Huye el compinche!',
          paginas: [
            'Penny: «¡Las moscas no paran: el enjambre tira más al oeste!»\n\n' +
              '«Si Sabiondo acertó con el Secuaz, no podemos dejar que se pierda en la niebla.»',
            'Sir Vectorius: «El Secuaz de M.A.D. está en (−7, 5), junto a las moscas infectadas. ' +
              'Desde la columna x = −5, cerrá el paso al oeste y alcanzalo.»\n\n' +
              'Penny: «Gadget estuvo cerca… ¡pero algo pasó!»'
          ],
          sonido: 'enjambre_de_moscas',
          sonidoRepeticiones: 2,
          nieblaEnPagina: 1,
          botonLabel: '¡Voy tras él!'
        }
      },
      {
        desc: 'Interroga al Secuaz de M.A.D. en (−7, 5).',
        meta: { tipo: 'vecino', x: -7, y: 5, marcador: false },
        aviso: {
          titulo: '😈 El Secuaz de M.A.D.',
          paginas: [
            'Sir Vectorius: «Penny, interrógalo en (−7, 5) antes de que se pierda en la niebla.»',
            'Secuaz: «Je, je… El sombrero era solo un cebo. Tu tío sigue perdido.»\n\n' +
              'Penny: «¡Dime dónde está Gadget!»',
            'Secuaz: «La señal verdadera brilla en (−4, 5)… si te atreves.»\n\n' +
              'Sir Vectorius: «No le creas a ciegas. Ve y compruébalo.»'
          ],
          botonLabel: '¡Voy a (−4, 5)!'
        }
      },
      {
        desc: 'Ve al disco luminoso en (−4, 5).',
        meta: { tipo: 'casilla', x: -4, y: 5, marcador: { x: -4, y: 5, ocultarLabel: true } },
        aviso: {
          titulo: '💫 Disco de señal',
          paginas: [
            'Penny: «¡Un disco de luz en el suelo! Debe ser la pista del Secuaz…»',
            'Penny: «Se apagó… Solo quedan chispas. ¡Era una trampa!»'
          ],
          botonLabel: '¡Sir, me engañó!'
        },
        encadenarSiguiente: true
      },
      {
        desc: 'Responde a Sir: bajar en el eje y.',
        meta: { tipo: 'casilla', x: -4, y: 5, marcador: false },
        aviso: {
          titulo: '⚔️ Sir Vectorius',
          paginas: [
            'Sir Vectorius: «¡Te engañó, Penny! (−4, 5) era un cebo de M.A.D.»',
            'Sir Vectorius: «Responde bien y con mi magia destruiré al Secuaz y sus moscas.»'
          ],
          botonLabel: '¡Estoy lista, Sir!'
        },
        pregunta: {
          texto:
            'Sir Vectorius: «Si estás a una altura y = 12 y bajas 6 lugares en el eje y, ' +
            '¿en qué coordenada y quedas?»',
          opciones: ['y = 6', 'y = 18', 'y = 12', 'y = 5'],
          correcta: 0,
          pista: 'Bajar en el eje y resta: 12 − 6 = 6.'
        },
        encadenarSiguiente: true
      },
      {
        desc: 'El Secuaz suplica; Penny y Sir deciden qué hacer.',
        meta: { tipo: 'casilla', x: -4, y: 5, marcador: false },
        aviso: {
          titulo: '😈 El Secuaz de M.A.D.',
          paginas: [
            'Secuaz: «¡No, no me hagas daño! ¡Ten clemencia, Penny!»\n\n' +
              '«Solo era un mensajero de Garra de M.A.D… ¡por favor!»',
            'Secuaz: «¡Gadget se fue al desierto… muy al este… oh, oh…!»\n\n' +
              'Penny: «¡Espera! ¿Al desierto?»\n\n' +
              'Sir Vectorius: «Basta de mentiras, embustero. Cuando digas la palabra, Penny, actuaré.»'
          ],
          botonLabel: '¡Sir, detenlo!'
        },
        encadenarSiguiente: true
      },
      {
        desc: 'Sir fulmina al Secuaz con magia.',
        meta: {
          tipo: 'casilla',
          x: -4,
          y: 5,
          /* Durante la cinemática el marcador no puede quedar en blanco (marcador: false borraba todo);
             el waypoint (0, 3) es el siguiente hito tras (−4, 5), igual que en la tarea de Sir. */
          marcador: { x: 0, y: 3, ocultarLabel: true }
        },
        aviso: {
          titulo: '⚔️ Sir Vectorius',
          texto:
            'Penny: «¡Ahora, Sir!»\n\n' + 'Sir Vectorius: «¡Recibe mi magia!»',
          botonLabel: '¡Zas!'
        },
        accion: [
          { tipo: 'magiaFlash' },
          { tipo: 'volarObjeto', x: -7, y: 5, tipos: ['secuazMad'] },
          { tipo: 'volarObjeto', x: -7, y: 4, tipos: ['mosca'] },
          { tipo: 'volarObjeto', x: -6, y: 7, tipos: ['mosca'] },
          { tipo: 'dispelNieblaSecuaz' }
        ],
        encadenarSiguiente: true
      },
      {
        desc: 'Sir activa el conteo de pasos.',
        /* La meta sigue siendo (−4, 5); el marcador amarillo anticipa (0, 3) para no perder
           el waypoint entre cerrar a Sir y la siguiente tarea (límite de pasos). */
        meta: {
          tipo: 'casilla',
          x: -4,
          y: 5,
          marcador: { x: 0, y: 3, ocultarLabel: true }
        },
        guiaMision: {
          alturaCompleta: true,
          verticales: [{ x: 0, color: 0x2563eb }]
        },
        aviso: {
          titulo: '⛰️ Sir Vectorius',
          paginas: [
            'Sir Vectorius: «Ahora sí te cuento los pasos, Penny: los justos hasta el cofre, ' +
              'con un poco de margen por si te equivocas.»',
            'Sir Vectorius: «Primero ve a (0, 3). Luego sube por el eje Y hasta la coordenada ' +
              '(0, 10), donde está el cofre.»'
          ],
          botonLabel: '¡Empiezo el recorrido!'
        },
        accion: {
          tipo: 'iniciarLimitePasos',
          ruta: [
            { x: 0, y: 3 },
            { x: 0, y: 10 }
          ],
          extra: 3
        }
      },
      {
        desc: 'Llega al punto (0, 3) en el eje.',
        meta: { tipo: 'casilla', x: 0, y: 3, marcador: { x: 0, y: 3, ocultarLabel: true } },
        aviso: {
          titulo: '⛰️ Sir Vectorius',
          texto:
            'Sir Vectorius: «¡Bien, Penny! Estás en (0, 3).»\n\n' +
            '«Ahora sube por el eje Y hasta (0, 10), donde está el cofre. ¡No pierdas pasos!»',
          botonLabel: '¡Subo por el eje y!'
        },
        guiaMision: {
          alturaCompleta: true,
          verticales: [{ x: 0, color: 0x2563eb }]
        }
      },
      {
        desc: '¡Llega al cofre en (0, 10)!',
        meta: { tipo: 'cofre', ocultarLabel: true },
        guiaMision: {
          alturaCompleta: true,
          verticales: [{ x: 0, color: 0x22c55e }]
        },
        aviso: {
          titulo: '🏆 ¡Lo lograste, Penny!',
          paginas: [
            'Penny: «¡Llegué al cofre en (0, 10)! He superado la misión en las Montañas.»',
            'Penny: «Pero mi tío Gadget aún no aparece… Seguiré buscándolo.»\n\n' +
              '«El Secuaz habló del desierto del este. ¡Voy para allá!»'
          ],
          botonLabel: '¡Hacia el desierto! 🏜️'
        }
      }
    ],
  /* Cuadrante I+II: x −7…+1 (9 columnas, más legible en móvil); y 0…11 como El Bosque. */
    xMin: -7,
    xMax: 1,
    yMin: 0,
    yMax: 11,
    decimals: false,
    mapKey: 'mapaMontanasIlustrado',
    playHint:
      'Orden Montañas: Sir y sombrero (−3,4) → recta x = −5 (pregunta) → acercarte al Secuaz (−7,5) → disco (−4,5) → magia Sir → (0,3) → cofre (0,10). No saltes el tramo de la recta.',
    characterKey: 'explorer',
    objectsKey: 'objetosJuegoGouache'
  },
  {
    id: 3,
    name: 'Nivel 3 · El Desierto',
    description: 'Los 4 cuadrantes — signos completos',
    story: 'Sombra‑Delta esconde el cofre en la zona oscura del plano. Penny debe leer signos negativos en x y en y a la vez para encontrar la entrada al tesoro.',
    objetivos: [
      'Reconocer los 4 cuadrantes del plano.',
      'Predecir signos de x e y según el cuadrante.',
      'Llegar al cofre cruzando dos ejes.'
    ],
    tareas: [
      {
        desc: 'Camina hasta el centro del mapa.',
        meta: { tipo: 'casilla', x: 5, y: 5 },
        pregunta: {
          texto: 'En el cuadrante III, ¿cómo son los signos de x e y?',
          opciones: ['x +, y +', 'x −, y −', 'x +, y −', 'x −, y +'],
          correcta: 1,
          pista: 'El cuadrante III queda abajo-izquierda. Ambas coordenadas son negativas.'
        }
      },
      {
        desc: 'Llega al cofre.',
        meta: { tipo: 'cofre' },
        pregunta: {
          texto: '¿En qué cuadrante está el punto (5, −3)?',
          opciones: ['I', 'II', 'III', 'IV'],
          correcta: 3,
          pista: 'x positivo y y negativo: eso es abajo-derecha.'
        }
      }
    ],
    xMin: -10, xMax: 10,
    yMin: -10, yMax: 10,
    decimals: false,
    mapKey: 'mapaDesiertoIlustrado',
    characterKey: 'explorer',
    objectsKey: 'objetosJuegoGouache'
  },
  {
    id: 4,
    name: 'Nivel 4 · El Océano',
    description: 'Coordenadas decimales',
    story: 'Capitán Hipotenusa marca el cofre en aguas profundas: la rejilla usa medias casillas y el tesoro está en una coordenada con decimales.',
    objetivos: [
      'Leer coordenadas con decimales (0.5, 1.5, …).',
      'Estimar entre qué dos enteros está un punto.',
      'Llegar al cofre con precisión.'
    ],
    tareas: [
      {
        desc: 'Pisa la casilla (3, 4) para revisar la brújula.',
        meta: { tipo: 'casilla', x: 3, y: 4 },
        pregunta: {
          texto: 'Si Penny está en x = 3.5, ¿entre qué enteros está?',
          opciones: ['2 y 3', '3 y 4', '4 y 5'],
          correcta: 1,
          pista: '3.5 es la mitad exacta entre 3 y 4.'
        }
      },
      {
        desc: 'Ve por el cofre.',
        meta: { tipo: 'cofre' },
        pregunta: {
          texto: 'El punto (2.5, 1.5) está…',
          opciones: ['Sobre una casilla entera', 'En el cruce de cuatro casillas enteras', 'Fuera del plano'],
          correcta: 1,
          pista: 'Las dos coordenadas son .5, así que cae justo en una intersección.'
        }
      }
    ],
    xMin: -10, xMax: 10,
    yMin: -10, yMax: 10,
    decimals: true,
    mapKey: 'mapaOceanoIlustrado',
    characterKey: 'explorer',
    objectsKey: 'objetosJuegoGouache'
  }
];

window.SCORE_RULES = {
  preguntaCorrectaPrimera: 10,
  preguntaCorrectaConPista: 5,
  llegadaCofre: 30,
  bonoEficiencia: 10,
  bonoEficienciaUmbral: 0.3,
  /** Por intentar pisar al lobo (puede sobrescribirse por nivel). */
  imprudenciaLobo: 5,
  /** Por intentar pisar cualquier otro obstáculo bloqueante (árbol, roca, NPC…). */
  imprudenciaColision: 5,
  /** Por intentar salir del borde del plano (misma idea que un obstáculo). */
  imprudenciaFueraMapa: 5
};

/** Medallas de puntos (arte genérico): tier según % de ⭐ del máximo del nivel. Ver src/medals.js */
window.MEDAL_RULES = {
  tierTres: 0.9,
  tierDos: 0.7,
  tierUno: 0.5
};

(function enrichTreasureFields() {
  var defaults = [
    {
      personajeInicial: { x: 0, y: 0 },
      tesoro: { x: 7, y: 9 },
      /* maxMovimientos = null → pasos ilimitados hasta que Penny pise el
         origen (0, 0); allí Bombeitor activa el reto y el HUD empieza a
         contar 16 pasos para llegar al cofre (7, 9). */
      maxMovimientos: null,
      objetos: [
        { x: 3, y: 4, tipo: 'rocaroja' },
        { x: 3, y: 4, tipo: 'dinamita' },
        { x: 7, y: 3, tipo: 'bombeitor' },
        { x: 2, y: 9, tipo: 'mosca' },
        { x: 2, y: 2, tipo: 'sultan' },
        { x: 5, y: 5, tipo: 'lobo' },
        { x: 0, y: 6, tipo: 'buho' },
        { x: 1, y: 1, tipo: 'binocular' }
      ]
    },
    {
      personajeInicial: { x: 0, y: 0 },
      tesoro: { x: 0, y: 10 },
      /* null → sin límite hasta iniciarLimitePasos (tras hablar con Vectorius). */
      maxMovimientos: null,
      objetos: [
        { x: 1, y: 2, tipo: 'sirVectorius' },
        { x: -3, y: 4, tipo: 'sombrero' },
        { x: -3, y: 4, tipo: 'sultanRastreo' },
        { x: -7, y: 4, tipo: 'mosca' },
        { x: -6, y: 7, tipo: 'mosca' },
        { x: -7, y: 5, tipo: 'secuazMad' }
      ]
    },
    {
      personajeInicial: { x: 1, y: 1 },
      tesoro: { x: 9, y: 8 },
      anchoMapa: 12,
      altoMapa: 10,
      maxMovimientos: 52,
      objetos: [
        { x: 4, y: 3, tipo: 'roca' },
        { x: 6, y: 6, tipo: 'arbol' },
        { x: 7, y: 2, tipo: 'roca' },
        { x: 3, y: 7, tipo: 'arbol' },
        { x: 10, y: 5, tipo: 'roca' },
        { x: 5, y: 8, tipo: 'arbol' }
      ]
    },
    {
      personajeInicial: { x: 0, y: 0 },
      tesoro: { x: 8, y: 7 },
      anchoMapa: 10,
      altoMapa: 10,
      maxMovimientos: 48,
      objetos: [
        { x: 2, y: 2, tipo: 'roca' },
        { x: 4, y: 5, tipo: 'arbol' },
        { x: 5, y: 3, tipo: 'roca' },
        { x: 7, y: 6, tipo: 'arbol' },
        { x: 3, y: 8, tipo: 'roca' },
        { x: 6, y: 1, tipo: 'arbol' }
      ]
    }
  ];

  window.LEVELS.forEach(function (L, i) {
    var d = defaults[i] || defaults[0];
    if (L.mapa == null) L.mapa = L.mapKey;
    if (L.personajeInicial == null) L.personajeInicial = { x: d.personajeInicial.x, y: d.personajeInicial.y };
    if (L.tesoro == null) L.tesoro = { x: d.tesoro.x, y: d.tesoro.y };
    if (L.objetos == null) L.objetos = d.objetos.map(function (o) { return { x: o.x, y: o.y, tipo: o.tipo }; });
    L._objetosPlantilla = L.objetos.map(function (o) {
      return { x: o.x, y: o.y, tipo: o.tipo };
    });
    var plane = getPlaneMetrics(L);
    L.anchoMapa = plane.ancho;
    L.altoMapa = plane.alto;
    if (L.maxMovimientos === undefined) L.maxMovimientos = d.maxMovimientos;
  });
})();

export const levels = window.LEVELS;
