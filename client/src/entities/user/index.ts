// User entity: the caller's own Profile (name, avatar, Unit preference), its counts, and their API bindings
export { initialsOf, MAX_NAME_CHARS, type Me, type ProfileCounts } from './model';
export { getMe, getProfileCounts, removeAvatar, setAvatar, setName, setUnitPreference, type ImageFile } from './api';
export { Avatar } from './Avatar';
