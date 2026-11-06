# Admin

There is no separate admin application in this repository yet.

Admin behaviour belongs to the `admin` module inside the one backend process. It uses the same PostgreSQL database, the same authentication system, and the `ADMIN` role. A future web UI should call `/api/v1` rather than talking to the database itself.

Planned admin work includes rider verification review, account suspension, service-zone management, and reading the audit log. Those routes are not implemented yet.
