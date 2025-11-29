import {
  getDataDirInfo,
  checkSwitchDir,
  switchDataDir,
  resetDataDir,
  pickDirectory,
} from "./configApi";
import { choiceDialog, confirmDialog } from "./dialogs";
import { showToast } from "./toast";
import { loadInitialState } from "./store";

/** 显示当前数据目录信息 */
export async function showDataDirInfo(): Promise<void> {
  try {
    const info = await getDataDirInfo();
    const status = info.isDefault ? "（默认）" : "（自定义）";
    const fileStatus = info.dataFileExists ? "✓ 数据文件存在" : "⚠ 数据文件不存在";
    const writeStatus = info.isWritable ? "" : "\n⚠ 目录不可写入";

    await confirmDialog({
      title: "数据目录",
      message: `${info.path}\n${status}\n${fileStatus}${writeStatus}`,
      confirmLabel: "确定",
      showCancel: false,
    });
  } catch (error) {
    showToast("获取目录信息失败");
    console.error("showDataDirInfo error:", error);
  }
}

/** 更改数据目录流程 */
export async function changeDataDir(): Promise<void> {
  try {
    // 1. 打开目录选择器
    const selectedPath = await pickDirectory();
    if (!selectedPath) {
      return; // 用户取消
    }

    // 2. 检查目标目录状态
    const check = await checkSwitchDir(selectedPath);

    if (check.type === "Invalid") {
      await confirmDialog({
        title: "无法使用该目录",
        message: check.reason,
        confirmLabel: "确定",
        showCancel: false,
      });
      return;
    }

    if (check.type === "EmptyDir") {
      // 新目录为空，询问是否复制数据
      const choice = await choiceDialog({
        title: "新目录为空",
        message: "是否将当前数据复制到新目录？",
        choices: [
          { label: "复制并切换", value: "copy", primary: true },
          { label: "仅切换", value: "switch" },
          { label: "取消", value: "cancel" },
        ],
      });

      if (choice === "cancel" || !choice) {
        return;
      }

      const action = choice === "copy" ? { action: "CopyToNew" as const } : { action: "UseExisting" as const };
      await switchDataDir(selectedPath, action);
      showToast("数据目录已更改");
      await loadInitialState();
      return;
    }

    if (check.type === "HasExistingData") {
      // 新目录已有数据
      const confirmed = await confirmDialog({
        title: "发现现有数据",
        message: `新目录中已存在数据文件\n最后修改：${check.lastModified}\n\n切换后将使用新目录中的数据，当前数据将自动备份。`,
        confirmLabel: "切换",
        cancelLabel: "取消",
      });

      if (!confirmed) {
        return;
      }

      await switchDataDir(selectedPath, { action: "UseExisting" });
      showToast("已切换到新数据目录");
      await loadInitialState();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "操作失败";
    showToast(message);
    console.error("changeDataDir error:", error);
  }
}

/** 重置为默认数据目录 */
export async function resetToDefaultDir(): Promise<void> {
  try {
    const info = await getDataDirInfo();
    if (info.isDefault) {
      showToast("当前已是默认目录");
      return;
    }

    const confirmed = await confirmDialog({
      title: "重置数据目录",
      message: "是否重置为默认数据目录？\n当前数据将自动备份。",
      confirmLabel: "重置",
      cancelLabel: "取消",
    });

    if (!confirmed) {
      return;
    }

    await resetDataDir();
    showToast("已重置为默认目录");
    await loadInitialState();
  } catch (error) {
    const message = error instanceof Error ? error.message : "重置失败";
    showToast(message);
    console.error("resetToDefaultDir error:", error);
  }
}
