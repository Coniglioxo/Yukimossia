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
    return Array.isArray(stored) ? stored : [];
}

export function saveGlobalBackgroundImages(imageIds: string[]): void {
    kvSet(CHAT_BACKGROUND_IMAGES_KEY, imageIds);
}

export function addGlobalBackgroundImage(imageId: string): void {
    const images = loadGlobalBackgroundImages();
    if (!images.includes(imageId)) {
        saveGlobalBackgroundImages([...images, imageId]);
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
        if (migrated === "true") {
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
        kvSet(CHAT_BACKGROUND_MIGRATION_FLAG_KEY, "true");
    } catch (error) {
        console.error("[背景图片迁移] 迁移失败", error);
    }
}

/**
 * 清理孤儿背景图片文件
 * 扫描 IndexedDB 中所有 chat_bg 类型的资源，删除未被引用的文件
 */
export async function cleanOrphanBackgroundImages(): Promise<{ cleaned: number; errors: string[] }> {
    const errors: string[] = [];
    let cleaned = 0;
    
    try {
        const { default: Dexie } = await import("dexie");
        
        // 打开主题资源数据库（背景图片存在这里）
        const db = new Dexie("ai_phone_theme_db_v1");
        db.version(2).stores({ assets: "id" });
        
        const allAssets = await db.table("assets").toArray() as Array<{ id: string; type: string }>;
        
        // 筛选出聊天背景类型的资源
        const chatBgAssets = allAssets.filter(asset => 
            asset.id.startsWith("chat_bg_") || asset.type === "chat_bg"
        );
        
        if (chatBgAssets.length === 0) {
            console.log("[背景清理] 没有找到聊天背景资源");
            return { cleaned: 0, errors: [] };
        }
        
        // 获取所有被引用的图片 ID
        const globalImages = loadGlobalBackgroundImages();
        const sessions = require("./chat-storage").loadChatSessions() as Array<Record<string, unknown>>;
        const referencedIds = new Set<string>([...globalImages]);
        
        // 收集所有会话当前使用的背景
        sessions.forEach(session => {
            if (typeof session.backgroundImage === "string" && session.backgroundImage) {
                referencedIds.add(session.backgroundImage);
            }
        });
        
        console.log(`[背景清理] 找到 ${chatBgAssets.length} 个背景资源，${referencedIds.size} 个被引用`);
        
        // 删除孤儿文件
        for (const asset of chatBgAssets) {
            if (!referencedIds.has(asset.id)) {
                try {
                    await db.table("assets").delete(asset.id);
                    cleaned++;
                    console.log(`[背景清理] 已删除孤儿文件: ${asset.id}`);
                } catch (err) {
                    const msg = `删除 ${asset.id} 失败: ${err}`;
                    errors.push(msg);
                    console.error(`[背景清理] ${msg}`);
                }
            }
        }
        
        db.close();
        console.log(`[背景清理] 完成，清理了 ${cleaned} 个孤儿文件`);
        
    } catch (error) {
        const msg = `清理过程出错: ${error}`;
        errors.push(msg);
        console.error(`[背景清理] ${msg}`);
    }
    
    return { cleaned, errors };
}
