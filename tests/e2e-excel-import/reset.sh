P="psql -h /home/claude/work/pg -p 5433 -U postgres -v ON_ERROR_STOP=1 -q"
$P -c "drop database if exists t484" -c "create database t484" >/dev/null
$P -d t484 -f fixture.sql >/dev/null && $P -d t484 -f items.sql >/dev/null && $P -d t484 -f seed.sql >/dev/null && $P -d t484 -f /home/claude/work/it475/pipeskool_excel_indent_import.sql 2>&1 | grep -v "NOTICE" 
