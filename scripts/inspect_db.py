import sqlite3, os

for db_path in ['data/dev.db', 'prisma/dev.db']:
    if os.path.exists(db_path):
        print('=== DB:', db_path)
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        print('Tables:', tables)
        for t in tables:
            tname = t[0]
            cursor.execute(f"SELECT count(*) FROM {tname}")
            count = cursor.fetchone()[0]
            print(f"  {tname}: {count} rows")
        
        # Check resumes table
        cursor.execute("SELECT id, userId, fileName, mimeType, createdAt FROM Resume")
        resumes = cursor.fetchall()
        print('Resumes in DB:', resumes)

