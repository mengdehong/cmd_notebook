import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

/** 数据目录信息 */
export interface DataDirInfo {
  path: string;
  isDefault: boolean;
  dataFileExists: boolean;
  isWritable: boolean;
}

/** 切换目录检测结果 */
export type SwitchDirCheck =
  | { type: "EmptyDir" }
  | { type: "HasExistingData"; lastModified: string }
  | { type: "Invalid"; reason: string };

/** 切换目录操作 */
export type SwitchDirAction =
  | { action: "CopyToNew" }
  | { action: "UseExisting" }
  | { action: "Cancel" };

/** 获取当前数据目录信息 */
export async function getDataDirInfo(): Promise<DataDirInfo> {
  return invoke<DataDirInfo>("get_data_dir_info");
}

/** 检查目标目录状态 */
export async function checkSwitchDir(path: string): Promise<SwitchDirCheck> {
  return invoke<SwitchDirCheck>("check_switch_dir", { path });
}

/** 执行目录切换 */
export async function switchDataDir(
  path: string,
  action: SwitchDirAction
): Promise<void> {
  return invoke("switch_data_dir", { path, action });
}

/** 重置为默认目录 */
export async function resetDataDir(): Promise<void> {
  return invoke("reset_data_dir");
}

/** 打开目录选择器 */
export async function pickDirectory(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "选择数据目录",
  });
  if (!selected) return null;
  return Array.isArray(selected) ? selected[0] : selected;
}
