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

# Admin (.migration/admin) — always the core DB
curl -s http://localhost:4000/migration/admin/promote/0001
curl -s http://localhost:4000/migration/admin/promote/0001/core
curl -s http://localhost:4000/migration/admin/promote/z-order/core

# Tenants (.migration/tenants) — all tenants, or one tenant
curl -s http://localhost:4000/migration/tenants/promote/0003
curl -s http://localhost:4000/migration/tenants/promote/0003/local
curl -s http://localhost:4000/migration/tenants/promote/z-order/local
curl -s http://localhost:4000/migration/tenants/rollback/z-order/local
```
