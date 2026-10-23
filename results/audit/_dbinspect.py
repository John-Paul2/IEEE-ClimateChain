import sqlite3
c=sqlite3.connect('file:data/vericems_demo.db?mode=ro',uri=True)
for (t,) in c.execute("select name from sqlite_master where type='table'"):
    print(t, c.execute('select count(*) from '+t).fetchone()[0], [r[1] for r in c.execute('pragma table_info('+t+')')])
