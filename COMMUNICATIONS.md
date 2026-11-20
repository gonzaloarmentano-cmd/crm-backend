# Activación de comunicaciones del CRM

## Render

Configurar las siguientes variables privadas del servicio crm-backend.

- CRM_GOOGLE_CLIENT_ID, ID del cliente OAuth web de Google.
- CRM_STAFF_EMAILS, emails del equipo autorizados, separados por comas.
- CRM_MAIL_SCRIPT_URL, URL /exec de la aplicación web del proyecto de BASE CRM que contiene MailsCRM.gs.
- CRM_MAIL_SCRIPT_KEY, secreto aleatorio compartido con Propiedades del script.
- SHOWROOM_CART_KEY, credencial existente de consulta de carritos.

Agregar el origen de producción del CRM y el origen de la vista previa usada para pruebas a los orígenes JavaScript autorizados del cliente OAuth. El permiso de Google identifica al operador. Los mails salen desde la cuenta ejecutora del proyecto de BASE CRM, usando su alias configurado.

## BASE CRM

Comparar apps-script/MailsCRM.gs con la versión actual del proyecto. Este archivo parte del script aportado el 17/11/2026. Integrar `enviarMailsDeudas` y `crmCommunicationsDoPost_` en el proyecto que ya contiene el envío. Mantener una única definición de `onOpen`, `doGet` y `doPost`. En el `doPost` existente, delegar los sobres que incluyan `body`, `timestamp` y `signature` a `crmCommunicationsDoPost_(e)`, que valida la firma. Conservar las demás rutas y el comportamiento que usa el actualizador de archivos.

Configurar CRM_MAIL_SCRIPT_KEY en Propiedades del script con el mismo secreto de Render. Inicializar SS_ID ejecutando Configurar tracking desde BASE CRM. Publicar una nueva versión de la aplicación web que ejecute como la cuenta remitente. La ruta de envío exige firma HMAC, timestamp reciente y un ID de lote. Las credenciales se conservan fuera del frontend y del repositorio.

El envío masivo del CRM requiere un saldo superior a $10.000 y email válido. El individual requiere saldo positivo y selecciona por ID de GRAL. Se procesan hasta cinco mails por solicitud. Cada solicitud guarda su resultado en Envios CRM y cada lote conserva el orden de los IDs en Lotes CRM. Los reintentos recuperan el resultado guardado. Si una ejecución queda EN CURSO, revisar los mails de la cuenta y Aperturas antes de resolver ese registro. La fecha del cliente se obtiene de Aperturas por su email.

## Showroom

El backend usa la consulta privada existente /buddies/v1/crm/cart-status por email exacto. La última conexión aparece únicamente si la respuesta proporciona lastConnection. El fragmento 211 todavía requiere ampliación para devolver ese dato como fecha ISO 8601 o `null`. El envío de recuperación vuelve a comprobar el carrito y verifica en GRAL que el email siga perteneciendo al ID del cliente. Usa una plantilla editable o un mensaje nuevo y registra el resultado en Envios CRM.

## Verificación antes de producción

Configurar los servicios y publicar ambos cambios coordinadamente. Antes de los envíos de prueba, configurar `CRM_MAIL_TEST_RECIPIENT` en Apps Script con `gonzaloarmentano@buddies.com.ar`. La propiedad impide el envío masivo y limita los envíos del CRM a esa dirección. Probar con una cuenta autorizada, una no autorizada y una ficha de prueba que tenga ese email. Retirar la propiedad después de verificar la entrega y los registros. Verificar el destinatario, el saldo de GRAL y la fecha registrada en Aperturas. Confirmar que un reintento con el mismo ID de solicitud conserva un único envío. Verificar un email con carrito y otro sin carrito en el showroom. La compilación y las pruebas locales usan servicios simulados y no comprueban la entrega real.
