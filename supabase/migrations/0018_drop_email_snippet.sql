-- Deja de guardar un trozo del cuerpo del correo en CADA transacción.
--
-- `transactions.raw_email_snippet` guardaba el `snippet` de Gmail (~200
-- caracteres del cuerpo) desde la migración 0001, con la idea de poder
-- depurar. En la práctica NUNCA se mostró ni se usó en ninguna pantalla, ni
-- se exporta al CSV: es dato muerto.
--
-- Y contradecía la política de privacidad, que dice "el cuerpo del mensaje se
-- descarta y no queda almacenado". La frase era falsa desde el principio, solo
-- que en pequeño. Al revisar la política para las muestras cifradas de la
-- migración 0017 salió a la luz.
--
-- El arreglo correcto no es documentarlo sino dejar de guardarlo: para depurar
-- un parser ya existe `failed_emails`, que guarda el correo ENTERO, cifrado y
-- con caducidad, y solo cuando de verdad falló.
--
-- Se vacía lo ya guardado. La columna se queda (borrarla obligaría a tocar el
-- tipo y los tests para nada); simplemente no se vuelve a escribir.
update public.transactions
set raw_email_snippet = null
where raw_email_snippet is not null;
