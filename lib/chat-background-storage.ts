import { kvGet, kvSet, registerKvMigration } from "./kv-db";

const CHAT_BACKGROUND_IMAGES_KEY = "ai_phone_chat_background_images_v1";
const CHAT_BACKGROUND_MIGRATION_FLAG_KEY = "ai_phone_chat_bg_migrated_v1";
registerKvMigration(CHAT_BACKGROUND_IMAGES_KEY);
registerKvMigration(CHAT_BACKGROUND_MIGRATION_FLAG_KEY);

/**
 * 全局聊天背景图片库
 * 所有角色共享，避免重复上传和存储
 */
export function loadGlobalBackgroundImages(): string[] {
    const stored = kvGet(CHAT_BACKGROUND_IMAGES_KEY);
    if (!stored) return [];
    try {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function saveGlobalBackgroundImages(imageIds: string[]): void {
    kvSet(CHAT_BACKGROUND_IMAGES_KEY, JSON.stringify(imageIds));
}

export function addGlobalBackgroundImage(imageId: string): void {
    const images = loadGlobalBackgroundImages();
    console.log("[背景图片] 当前全局库:", images);
    if (!images.includes(imageId)) {
        const updated = [...images, imageId];
        saveGlobalBackgroundImages(updated);
        console.log("[背景图片] 添加图片:", imageId, "更新后:", updated);
        // 立即验证保存结果
        const verify = loadGlobalBackgroundImages();
        console.log("[背景图片] 验证保存结果:", verify);
        if (!verify.includes(imageId)) {
            console.error("[背景图片] 保存失败！图片未出现在验证结果中");
        }
    } else {
        console.log("[背景图片] 图片已存在，跳过添加:", imageId);
    }
}

export function removeGlobalBackgroundImage(imageId: string): void {
    const images = loadGlobalBackgroundImages();
    saveGlobalBackgroundImages(images.filter(id => id !== imageId));
}

/**
 * 从所有会话迁移旧的背景图片到全局库
 * 避免旧图片变成孤儿文件占用空间
 * 使用标记确保只迁移一次
 */
export function migrateSessionBackgroundsToGlobal(): void {
    try {
        // 检查是否已经迁移过
        const migrated = kvGet(CHAT_BACKGROUND_MIGRATION_FLAG_KEY);
        if (migrated === true) {
            return; // 已迁移，跳过
        }
        
        const sessions = require("./chat-storage").loadChatSessions() as Array<Record<string, unknown>>;
        const allImageIds = new Set<string>();
        
        // 收集所有会话中的背景图片 ID
        sessions.forEach(session => {
            const oldImages = session.backgroundImages;
            if (Array.isArray(oldImages)) {
                oldImages.forEach(id => {
                    if (typeof id === "string" && id) {
                        allImageIds.add(id);
                    }
                });
            }
        });
        
        // 合并到全局库（保留已有的图片）
        if (allImageIds.size > 0) {
            const globalImages = loadGlobalBackgroundImages();
            const merged = Array.from(new Set([...globalImages, ...Array.from(allImageIds)]));
            saveGlobalBackgroundImages(merged);
            console.log(`[背景图片迁移] 已迁移 ${allImageIds.size} 张图片到全局库`);
        }
        
        // 标记已迁移
        kvSet(CHAT_BACKGROUND_MIGRATION_FLAG_KEY, true);
    } catch (error) {
        console.error("[背景图片迁移] 迁移失败", error);
    }
}
