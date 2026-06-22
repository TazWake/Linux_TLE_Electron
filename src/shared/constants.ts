export const FILESYSTEM_HEADER =
  'Date,Size,Type,Mode,UID,GID,Meta,File Name'

export const SUPER_HEADER =
  'datetime,timestamp_desc,source,source_long,message,parser,display_name,tag'

export const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024
export const MAX_ROW_COUNT = 10_000_000
export const INDEX_PROGRESS_INTERVAL = 100_000
export const SEARCH_PROGRESS_INTERVAL = 100_000
/** Files at or below this row count use client-side row model (more reliable on Linux VMs). */
export const CLIENT_SIDE_ROW_THRESHOLD = 50_000
