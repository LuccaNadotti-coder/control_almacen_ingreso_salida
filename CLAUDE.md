# SFIDA · Control de salidas y devoluciones de almacén

App de escritorio Electron para una sola PC con Windows, offline, base SQLite local.

## Dominio
El almacén entrega prendas a tres áreas (Lavandería, Diseño, Acabados) mediante BOLETAS DE SALIDA.
Las áreas devuelven mediante BOLETAS DE RETORNO propias, con su propio número, y mezclan prendas
de varias salidas en un mismo retorno. El sistema reparte automáticamente lo que llega contra las
boletas de salida pendientes, saldando primero la más antigua (FIFO), con vista previa editable.

## Reglas que nunca se rompen
1. Toda validación vive en el proceso main. La UI no valida, solo muestra.
2. Guardar un retorno es UNA transacción: retorno + items + asignaciones + recálculo de estados.
3. Nunca asignar más de lo pendiente. El pendiente se relee de la base al guardar, no se confía en la UI.
4. cantidad_devuelta de una línea SIEMPRE debe igualar la suma de sus asignaciones.
5. Nada se borra: se anula con motivo (boletas, retornos, áreas y encargados incluidos).
6. El renderer nunca toca la base. Todo pasa por IPC con contextIsolation activo.
7. Todo texto ingresado por el usuario en modelo, talla, color, nombre de encargado, nombre de área,
   número de boleta y número de retorno se normaliza a MAYÚSCULAS, sin espacios dobles ni al borde,
   tanto en el renderer (mientras se escribe) como en el main (antes de guardar). La observación y el
   motivo de anulación quedan como texto libre, sin normalizar.

## Referencia visual
docs/prototipo-completo-sfida-almacen.html — respetar layout, colores y nombres de pantallas.

## Paleta
fondo #141013 · panel #1C181B · borde #2E292F · texto #EDE7EA · apagado #9B9098
vino #9B2E48 · vino suave #3A1A24 · verde #3E8E5A · ámbar #C08A2E · falta #F08AA0
Números siempre con font-variant-numeric: tabular-nums.

## Stack
Electron + electron-builder + SheetJS (xlsx). HTML/CSS/JS vanilla, sin frameworks.
Base de datos en app.getPath('userData').

No crees nada más todavía.
