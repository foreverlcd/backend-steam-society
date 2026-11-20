# TURN no llega a otros servicios de la VM por la IP privada

- **Repo:** backend
- **Dificultad:** alta (planificador; zona roja: despliegue y red)
- **Rama:** fix/turn-private-ip

## Objetivo
`allowed-peer-ip=$TURN_PRIVATE_IP` (necesario para llamadas TURN a TURN) deja que una usuaria con credencial TURN use coturn como proxy hacia cualquier puerto de la IP privada de la VM (SSH, HTTP/3 de Caddy, etc.). Limitar el relay a UDP y, con iptables, solo al rango de relay de coturn.

## Contexto mínimo
- `deploy/turnserver.conf`
- `deploy/docker-compose.prod.yml` (servicio `coturn`: red del host, `--proc-user=nobody`)
- `docs/DEPLOY-ORACLE.md` §2.2

## Archivos a tocar
- `deploy/turnserver.conf`
- `docs/DEPLOY-ORACLE.md`
- `docs/PROGRESS.md`

## Pasos
1. `no-tcp-relay` en `turnserver.conf` (WebRTC relaya por UDP; el transporte TCP/TLS hacia el servidor sigue igual) y explicar en el comentario por qué `allowed-peer-ip` existe y qué lo acota.
2. DEPLOY-ORACLE §2.2: reglas OUTPUT para el usuario `nobody` (uid 65534, el de coturn tras bajar privilegios): aceptar UDP 49160:49200 hacia la IP privada y rechazar todo lo demás hacia ella; guardar con `netfilter-persistent`. Incluir comprobación.
3. PROGRESS: fila nueva y quitar este pendiente de la lista.

## Criterio de terminado
- [ ] `turnserver.conf` tiene `no-tcp-relay` y el comentario explica el límite.
- [ ] DEPLOY-ORACLE documenta las reglas OUTPUT, cómo verlas y por qué no ponerlas sin ACCEPT previo.
- [ ] Tests nuevos para: ninguno (configuración; validación con `docker compose config` y `turnserver` en local si es posible)
- [ ] `scripts/gate.sh full` en verde
- [ ] Docs actualizados: DEPLOY-ORACLE, PROGRESS

## Fuera de alcance
- Cambiar la topología (otra VM para TURN) o quitar `allowed-peer-ip`.

## Bitácora
| Fecha | Quién | Qué pasó |
|---|---|---|
