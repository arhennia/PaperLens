"""Supabase data access for the processing service.

All persistence lives here. :mod:`backend.extraction` and
:mod:`backend.analysis` import nothing from this package, which is what lets them
be tested without a database.

Every function in this package uses the service-role key, which **bypasses RLS**.
So each query must scope itself explicitly by the job's ``user_id`` and
``folder_id``: the database will not do it for this connection. Where a helper
takes a ``user_id``, passing the wrong one is a cross-user data leak, so it is
always taken from the claimed job rather than from anything caller-supplied.
"""
