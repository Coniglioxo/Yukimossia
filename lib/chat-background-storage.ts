import { kvGet, kvSet, registerKvMigration } from "./kv-db";

const CHAT_BACKGROUND_IMAGES_KEY = "ai_phone_chat_background_images_v1";
registerKvMigration(CHAT_BACKGROUND_IMAGES_KEY);

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
