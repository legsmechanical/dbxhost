/* tests/js/stubs/shared_constants.mjs — bundle-time stand-in for the
 * on-device /data/UserData/schwung/shared/constants.mjs.
 *
 * One repo, one deliverable: the file the device serves is the host tree's
 * own, so re-export it rather than hand-mirroring names. (The hand-mirrored
 * version silently lacked the picker palette names — a test importing them
 * would have failed on a name the device resolves fine.) */
export * from '../../../../src/shared/constants.mjs';
