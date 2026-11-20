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

Comparar apps-script/MailsCRM.gs con la versión actual del proyecto. Este archivo parte del script aportado el 17/11/2026. Integrar los cambios de enviarMailsDeudas y doPost en el mismo proyecto que ya contiene el envío. Mantener una única definición de cada función onOpen, doGet y doPost. Si el proyecto también contiene el actualizador de archivos, integrar sus rutas en el doPost existente.

Configurar CRM_MAIL_SCRIPT_KEY en Propiedades del script con el mismo secreto de Render. Inicializar SS_ID ejecutando Configurar tracking desde BASE CRM. Publicar una nueva versión de la aplicación web que ejecute como la cuenta remitente. La ruta de envío exige firma HMAC, timestamp reciente y un ID de lote. Las credenciales se conservan fuera del frontend y del repositorio.

El envío masivo del CRM requiere un saldo superior a $10.000 y email válido. El individual requiere saldo positivo y selecciona por ID de GRAL. Se procesan hasta cinco mails por solicitud. Cada solicitud guarda su resultado en Envios CRM y cada lote conserva el orden de los IDs en Lotes CRM. Los reintentos recuperan el resultado guardado. Si una ejecución queda EN CURSO, revisar los mails de la cuenta y Aperturas antes de resolver ese registro. La fecha del cliente se obtiene de Aperturas por su email.

## Showroom

El backend usa la consulta privada existente /buddies/v1/crm/cart-status por email exacto. La última conexión aparece únicamente si la respuesta proporciona lastConnection. El endpoint existente todavía requiere ampliación para devolver ese dato. El envío de recuperación de carrito y su plantilla siguen pendientes.

## Verificación antes de producción

Configurar los servicios y publicar ambos cambios coordinadamente. Probar con una cuenta autorizada, una no autorizada y un cliente de prueba con email propio. Verificar el destinatario, el saldo de GRAL y la fecha registrada en Aperturas. Confirmar que un reintento con el mismo ID de solicitud conserva un único envío. Verificar un email con carrito y otro sin carrito en el showroom. La compilación y las pruebas locales usan servicios simulados y no comprueban la entrega real.
