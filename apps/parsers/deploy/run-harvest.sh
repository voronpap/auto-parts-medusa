#!/usr/bin/env bash
# Bulk collection through the manufacturers' catalogues, one queue per site so
# that a site is never asked by two processes at once:
#   1. their numbers that fit Chinese makes (listed through the vehicle tree);
#   2. every number of theirs in the suppliers' price lists — all makes.
# Sources whose robots.txt closes the API (MANN-FILTER, bilstein group) are
# not here: they are asked one number at a time, on demand.
# Safe to stop and start again: lists are kept, loaded numbers are skipped.
# Progress: .cache/harvest/progress.log
cd /home/vrn/medusa-store/apps/parsers
set -a; . ./.env; . ../backend/.env; set +a
export CATALOG_URL=http://127.0.0.1:9000
D=.cache/harvest
mkdir -p $D
PY=.venv/bin/python
MAKES=(CHERY GEELY BYD "GREAT WALL" HAVAL CHANGAN MG JAC FAW)

note() { echo "$(date '+%F %T') $*" >> $D/progress.log; }

# load <name> <adapter> <brand> <number type>: looks every number of the list up.
load() {
  local name=$1 adapter=$2 brand=$3 type=$4

  if [ ! -s $D/$name.txt ]; then
    note "$name: nothing to load"
    return
  fi

  note "$name: $(wc -l < $D/$name.txt) numbers, loading"
  PARSERS_WORKER=harvest-$name nice -n 10 $PY -m parsers --cache $D/cache-$adapter.sqlite import-numbers \
    --brand "$brand" --adapter $adapter --number-type $type --file $D/$name.txt > $D/$name.import.log 2>&1
  note "$name: $(tail -n 1 $D/$name.import.log | cut -c1-200)"
}

# tree <name> <adapter> <brand> <type> <list command...>: lists through the vehicle tree, then loads.
tree() {
  local name=$1 adapter=$2 brand=$3 type=$4
  shift 4

  if [ ! -s $D/$name.txt ]; then
    note "$name: listing"
    nice -n 10 "$@" --cache $D/cache-$adapter.sqlite > $D/$name.tmp 2> $D/$name.list.log && mv $D/$name.tmp $D/$name.txt
  fi

  load $name $adapter "$brand" $type
}

# price <name> <adapter> <brand key in the price lists>: numbers in stock first.
price() {
  local name=$1 adapter=$2 key=$3
  local brand
  brand=$(psql "$DATABASE_URL" -Atc "select brand from supply_offer where deleted_at is null and normalized_brand = '$key' group by 1 order by count(*) desc limit 1")

  if [ ! -s $D/$name.txt ]; then
    psql "$DATABASE_URL" -Atc "select number from (select number, max(coalesce(stock_quantity, 0)) as stock from supply_offer where deleted_at is null and is_listed and normalized_brand = '$key' group by 1) t order by stock desc, number" > $D/$name.txt
  fi

  load $name $adapter "$brand" aftermarket
}

(
  tree china-trw zf TRW aftermarket $PY tools/zf_model_numbers.py --part-brand TRW --brands "${MAKES[@]}"
  tree china-sachs zf SACHS aftermarket $PY tools/zf_model_numbers.py --part-brand SACHS --brands "${MAKES[@]}"
  tree china-lemforder zf LEMFÖRDER aftermarket $PY tools/zf_model_numbers.py --part-brand LEMFÖRDER --brands "${MAKES[@]}"
  price price-lemforder zf lemforder
  price price-sachs zf sachs
  price price-trw zf trw
  note "zf queue done"
) &
(
  price price-bosch bosch bosch
  note "bosch queue done"
) &
(
  tree china-nissens nissens Nissens aftermarket $PY tools/nissens_make_numbers.py --brands "${MAKES[@]}"
  price price-nissens nissens nissens
  note "nissens queue done"
) &
(
  tree china-ctr ctr CTR aftermarket $PY tools/ctr_make_numbers.py --brands "${MAKES[@]}"
  price price-ctr ctr ctr
  note "ctr queue done"
) &
(
  tree china-metelli metelli Metelli aftermarket $PY tools/metelli_model_numbers.py --part-brand Metelli --brands "${MAKES[@]}"
  tree china-cifam metelli Cifam aftermarket $PY tools/metelli_model_numbers.py --part-brand Cifam --brands "${MAKES[@]}"
  price price-metelli metelli metelli
  price price-graf metelli graf
  note "metelli queue done"
) &
(
  price price-nrf nrf nrf
  note "nrf queue done"
) &
(
  tree china-nibk nibk NiBK aftermarket $PY tools/nibk_model_numbers.py --brands "${MAKES[@]}"
  note "nibk queue done"
) &
(
  tree china-facet facet FACET aftermarket $PY tools/facet_model_numbers.py --brands "${MAKES[@]}"
  price price-eps eps eps
  note "facet queue done"
) &
(
  tree china-geely geely-ksa Geely oem $PY tools/geely_ksa_model_numbers.py
  tree china-mg mg-egypt MG oem $PY tools/mg_egypt_model_numbers.py
  note "oe queue done"
) &
wait
note "all queues done"
