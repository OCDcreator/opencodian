# ADR 0003 — ZCode official login is isolated; personal API configuration is shared

Status: accepted

OpenCodian owns its official ZCode login on each machine, shared across its vaults and independent of the ZCode desktop account. Personal API services remain the native configuration shared with ZCode. This deliberately separates account consent from model-service administration while preserving the existing session store and users’ API setup.

Login/logout use the installed official CLI in private temporary roots, serialize across vaults, and publish only successful non-cancelled credentials. The temporary model-selection file prevents CLI login from changing the desktop default. Credentials never enter plugin settings, vault files, screenshots or diagnostics. API edits use explicit allowlists, native-compatible locks, revisions, archives and atomic writes, with conflict recovery. Persistence, catalog confirmation and session application remain separate evidence axes under ADR 0001.

Reusing desktop credentials was rejected because signing out in either product would silently affect the other. Copying API settings into a plugin-owned second store was rejected because it would diverge from the model directory users manage in ZCode.
