import { kvGet, kvSet, registerKvMigration } from "./kv-db";

const CHAT_BACKGROUND_IMAGES_KEY = "ai_phone_chat_background_images_v1";
registerKvMigration(CHAT_BACKGROUND_IMAGES_KEY);

/**
 * 全局聊天背景图片库
 * 所有角色共享，避免重复上传和存储
 */
export function loadGlobalBackgroundImages(): string[] {
    const stored = kvGet(CHAT_BACKGROUND_IMAGES_KEY);
    console.log("[背景图片] 读取原始值:", stored, "类型:", typeof stored);
    
    if (!stored) {
        console.log("[背景图片] 无数据，返回空数组");
        return [];
    }
    
    try {
        const parsed = JSON.parse(stored);
        console.log("[背景图片] JSON解析结果:", parsed, "是否数组:", Array.isArray(parsed));
        const result = Array.isArray(parsed) ? parsed : [];
        console.log("[背景图片] 最终返回:", result);
        return result;
    } catch (e) {
        console.error("[背景图片] JSON解析失败:", e);
        return [];
    }
}

export function saveGlobalBackgroundImages(imageIds: string[]): void {
    const json = JSON.stringify(imageIds);
    console.log("[背景图片] 保存数组:", imageIds);
    console.log("[背景图片] JSON序列化:", json);
    kvSet(CHAT_BACKGROUND_IMAGES_KEY, json);
    console.log("[背景图片] kvSet 已调用");
    
    // 立即验证
    setTimeout(() => {
        const verify = kvGet(CHAT_BACKGROUND_IMAGES_KEY);
        console.log("[背景图片] 验证读取:", verify);
        if (verify !== json) {
            console.error("[背景图片] 保存验证失败！期望:", json, "实际:", verify);
        } else {
            console.log("[背景图片] 保存验证成功！");
        }
    }, 100);
}

export function addGlobalBackgroundImage(imageId: string): void {
    const images = loadGlobalBackgroundImages();
    console.log("[背景图片] 添加前的图片列表:", images);
    
    if (!images.includes(imageId)) {
        const updated = [...images, imageId];
        console.log("[背景图片] 添加图片:", imageId, "更新后列表:", updated);
        saveGlobalBackgroundImages(updated);
    } else {
        console.log("[背景图片] 图片已存在，跳过:", imageId);
    }
}

export function removeGlobalBackgroundImage(imageId: string): void {
    const images = loadGlobalBackgroundImages();
    const updated = images.filter(id => id !== imageId);
    console.log("[背景图片] 删除图片:", imageId, "更新后列表:", updated);
    saveGlobalBackgroundImages(updated);
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
