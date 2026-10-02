# GitFlow simplificado

Remoto: `origin` → `https://github.com/Developer-vic1/NETFLIX.git`.

- `main`: versión ejecutable y validada.
- `develop`: integración de preparación técnica.
- `feature/ui-foundation`: sistema visual, shell y componentes.
- `feature/localization`: configuración región/idioma, diccionarios y RTL.
- `feature/testing`: pruebas técnicas, documentación y correcciones verificadas.
- Ramas futuras según necesidad: home-interface, player, recommendations, account, operations y monitoring. No se crean sin trabajo concreto.

## Secuencia manual para futuros cambios

```powershell
git status
git branch --show-current
git remote -v
git switch develop
git switch -c feature/nombre-del-modulo
# Completar manualmente el módulo y ejecutar comprobaciones.
git diff
git add -- ruta/archivo-intencional
git diff --cached
git diff --cached --check
git commit -m "feat: describe the concrete module change"
git push -u origin feature/nombre-del-modulo
git switch develop
git merge --no-ff feature/nombre-del-modulo
# Ejecutar QA en develop.
git push -u origin develop
# Solo con QA completo:
git switch main
git merge --no-ff develop
git push -u origin main
```

Conventional Commits: chore, feat, fix, refactor, style, docs y test. Un commit debe contener una modificación coherente.

Inspeccionar todos los archivos antes de staging. No usar `git add .` sin revisión, reset hard, force push ni eliminar ramas remotas. Si falla una operación Git: detener commits y push, registrar comando/error, comprobar status, rama y log; resolver la causa antes de continuar. Si el remoto avanzó, revisar su historial; no forzar la publicación.

Las integraciones de esta preparación son locales y explícitas. El inventario y evidencia final están en DELIVERY.md y QA.md. No se requiere PR para la integración local solicitada; el informe indica si se creó alguno.
