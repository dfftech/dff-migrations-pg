### env example

```sh
export BASE_NAME=CORE
export CORE_DB_URL='postgresql://postgres:postgres@localhost:5432/public'
export CORE_REPO_URL='https://github.com/org/migrations.git'
export CORE_REPO_TOKEN='ghp_...'
echo $CORE_DB_URL
```

### health curl

```sh
# :id is the tenant (works for single- and multi-tenant)
curl -s http://localhost:4000/health/local

# Single DB (no tenants table) — last path segment is schema
curl -s http://localhost:4000/migration/promote/0001
curl -s http://localhost:4000/migration/promote/0001/public
curl -s http://localhost:4000/migration/promote/z-order/public
curl -s http://localhost:4000/migration/rollback/z-order/public

# Multi-tenant (tenants table exists) — last path segment is tenant id
curl -s http://localhost:4000/migration/promote/0001
curl -s http://localhost:4000/migration/promote/0001/local
curl -s http://localhost:4000/migration/promote/z-order/local
curl -s http://localhost:4000/migration/rollback/z-order/local
```
