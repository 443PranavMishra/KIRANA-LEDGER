select
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on p.pronamespace = n.oid
where n.nspname = 'public'
  and p.proname in ('match_customer', 'match_shopkeeper');
