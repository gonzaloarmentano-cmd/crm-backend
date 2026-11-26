# Mail de deuda del CRM Buddies

Render requiere `CRM_GOOGLE_CLIENT_ID` para la audiencia OAuth, `CRM_STAFF_EMAILS` con los operadores autorizados, `CRM_MAIL_SCRIPT_URL` con la URL /exec de BASE CRM y `CRM_MAIL_SCRIPT_KEY` con la clave compartida. El secreto va exclusivamente en Render y en Propiedades del script. El cliente OAuth web debe autorizar el origen del CRM.

Integrar `apps-script/MailsCRM.gs` como archivo nuevo en el proyecto vinculado a BASE CRM. Si el proyecto ya cuenta con un `doPost`, delegar los sobres firmados a `crmCommunicationsDoPost_` conservando el resto. Actualizar la aplicación web existente que ejecuta como el remitente. El puente verifica la firma y usa GRAL como fuente del destinatario y los importes. La plantilla CRM no contiene píxeles.

`CRM_MAIL_TEST_RECIPIENT` en Propiedades del script deshabilita los envíos generales y permite el envío individual solamente al destinatario indicado. En modo de prueba, verificar con un cliente de prueba identificado y simular la selección general con la vista previa. Eliminar la propiedad cuando se valide la entrega y el registro del contacto de prueba.

El registro **Registro mails de deuda CRM** guarda el resultado por solicitud y cliente. Una solicitud interrumpida sin confirmación de entrega debe revisarse antes de iniciar un nuevo envío independiente. **Lotes de deuda CRM** conserva los resultados por página para responder los reintentos sin reenviar.
