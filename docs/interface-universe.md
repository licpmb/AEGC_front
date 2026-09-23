# Universo de interfaces: contrato de integración

## Estado comprobado

AEGC_front es un prototipo Next.js con mapa, panel de detalles, documentación, importación, carga y roles. Consume constantes locales en `lib/atlas-data.ts`, `lib/archimate-data.ts` y otros módulos. El formulario de ingreso sólo cambia estado React; el botón Microsoft no autentica. Formularios de carga e importación aún no persisten. Los servidores, URLs, métricas, identidades, flujos e issues de ejemplo **no son evidencia corporativa**.

AEGC contiene API .NET, BFF, SQL Server y proyección Archi probados en DEV local según su README. No está conectado a este frontend ni a servicios corporativos. La integración debe funcionar por BFF con sesión y permisos verificados por backend. No poner tokens de GitLab, Microsoft Graph ni SQL en el navegador.

## Modelo canónico

- `Asset`: id estable, nombre, clase (aplicación, componente, API, servicio, almacén, infraestructura, externo), dominio, responsable, ciclo de vida, criticidad.
- `Integration`: id estable, nombre, propósito, sistema emisor y receptor, datos intercambiados, dirección, protocolo, formato, autenticación referencial, frecuencia, SLA, dueño, estado, país. Una interfaz puede tener varios tramos (`IntegrationLeg`), cada uno con origen, destino, orden y tecnología. No confundir dependencia técnica, contención y flujo de datos.
- `Environment`: id y nombre controlado (DEV, QAS, PRD u otros aprobados). `Deployment` vincula activo/servicio a ambiente, endpoint, host y versión. Nunca asumir que un estado de salud de PRD aplica a QAS.
- `Endpoint`: servicio, método, ruta, esquema referenciado, variantes y ambiente. Ejemplos de payload deben ser sanitizados y tener fuente.
- `DocumentReference`: proveedor, URL/ID estable, tipo, versión, clasificación, responsable, fecha de observación y revisión; ACL del origen. Los binarios permanecen en SharePoint u origen aprobado.
- `ArchiLink`: ID original del elemento/relación/vista, versión/commit y checksum del modelo oficial. Archi en GitLab es fuente del XML; SQL contiene proyección consultable.
- `Evidence`: fuente, URL, fecha, hash/versión, estado de validación y aprobador. Cada afirmación importada debe conservar procedencia y distinguir `propuesto`, `verificado`, `contradictorio`.
- `MapLayout`: posiciones y preferencias de vista por usuario/equipo. Las coordenadas no son atributos de negocio de una interfaz.
- `OperationalSignal`: referencia a observabilidad con ambiente y fecha; sin inventar métricas o salud.

Usar claves estables propias para unir registros; no usar el nombre visible, URL o posición como ID. Mantener historial y auditoría de cambios.

## Contrato inicial BFF (adaptador)

Las lecturas existentes de AEGC (`/api/v1/catalog/items`, `/api/v1/catalog/relationships`, `/api/v1/interfaces`, `/api/v1/documents`, `/api/v1/architecture/elements`, `/api/v1/architecture/relationships`, `/api/v1/architecture/views`) son la base. Versionar un endpoint de proyección `GET /api/v1/atlas?environment=PRD` en el backend, que entregue nodos, relaciones tipadas, interfaces, despliegues y documentos, junto con `source`, `observedAt` y `verificationState`. No derivar ambientes o rutas de los textos de las etiquetas. Si el backend aún no tiene endpoints/despliegues, ampliar primero su dominio y migraciones.

Las mutaciones deben usar permisos por operación, concurrencia y auditoría. La importación de Excel/CSV/Archi propone diferencias para revisión; nunca sobreescribe silenciosamente datos validados. Archi conserva sus IDs y su proceso de bloqueo/preview/commit.

## Secuencia de trabajo

1. Quitar el ingreso simulado como ruta de producción; integrar sesión Entra por el BFF corporativo. Mantener modo demo aislado, señalado y sin datos reales.
2. Crear adaptador tipado para lecturas del BFF; estados de carga/error/vacío y pruebas de transformación. El mapa y paneles deben consumir una única proyección real.
3. Extender backend para ambientes, despliegues, tramos de integración, endpoints y vínculo documental donde falten; migraciones y pruebas de API.
4. Formularios reales de alta/edición con validación, permisos y auditoría. Importación con vista previa, resolución de duplicados y contradicciones.
5. Sincronizar SharePoint, GitLab y Archi mediante conectores del backend respetando ACL. Registrar frescura y evidencia.
6. Vistas por sistema, integración, ambiente y extremo a extremo; filtros, búsqueda, exportación y trazabilidad de origen.

## Datos necesarios para poblarlo

Inventario inicial (Excel si existe), archivo `.archimate` real o copia autorizada, una integración completa de ejemplo con sus Word/PDF y enlaces documentales, lista de ambientes, responsables y taxonomías aprobadas. Hasta disponer de ello, no promover las constantes de demostración a producción.

## Criterio para la primera entrega funcional

Con una integración real aprobada: importar o cargar sistemas y tramos, vincular ambientes y documentos, mostrar el recorrido y el detalle en AEGC_front, consultar datos desde AEGC vía BFF, conservar evidencia y probar que un usuario sin permiso no puede leer ni editar lo restringido.
