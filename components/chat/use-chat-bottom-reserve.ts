"use client";

import { useLayoutEffect, type RefObject } from "react";

const CHAT_BOTTOM_RESERVE_CSS_VAR = "--chat-bottom-reserve";
const STICK_TO_BOTTOM_THRESHOLD = 120;

function findBottomOverlay(wrapper: HTMLElement): HTMLElement | null {
    for (const child of Array.from(wrapper.children)) {
        if (!(child instanceof HTMLElement)) continue;
        const ui = child.dataset.ui;
        if (ui === "input" || ui === "multi-select") return child;
    }
    return null;
}

export function useChatBottomReserve<TWrapper extends HTMLElement, TScroll extends HTMLElement>(
    wrapperRef: RefObject<TWrapper | null>,
    scrollRef: RefObject<TScroll | null>,
    refreshKey: string,
) {
    useLayoutEffect(() => {
        if (typeof window === "undefined") return;
        const wrapper = wrapperRef.current;
        if (!wrapper) return;

        let frame = 0;
        let bottomScrollFrame = 0;
        let observer: ResizeObserver | null = null;

        const scheduleStickToBottom = () => {
            if (bottomScrollFrame) window.cancelAnimationFrame(bottomScrollFrame);
            bottomScrollFrame = window.requestAnimationFrame(() => {
                bottomScrollFrame = 0;
                const el = scrollRef.current;
                if (el) el.scrollTop = el.scrollHeight;
            });
        };

        const measure = () => {
            frame = 0;
            const overlay = findBottomOverlay(wrapper);
            if (!overlay) {
                wrapper.style.removeProperty(CHAT_BOTTOM_RESERVE_CSS_VAR);
                return;
            }

            const el = scrollRef.current;
            const wasNearBottom = el
                ? el.scrollHeight - el.scrollTop - el.clientHeight < STICK_TO_BOTTOM_THRESHOLD
                : false;
            
            // 计算输入栏高度 + 键盘占用的空间
            const overlayRect = overlay.getBoundingClientRect();
            const overlayHeight = Math.ceil(overlayRect.height);
            
            // visualViewport 缩小时说明键盘弹起了
            const visualHeight = window.visualViewport?.height || window.innerHeight;
            const keyboardHeight = Math.max(0, window.innerHeight - visualHeight);
            
            // 总预留高度 = 输入栏高度 + 键盘高度
            const reserveHeight = overlayHeight + keyboardHeight;

            if (reserveHeight > 0) {
                wrapper.style.setProperty(CHAT_BOTTOM_RESERVE_CSS_VAR, `${reserveHeight}px`);
                // Debug: 同时更新 page-body 的 bottom
                const pageBody = wrapper.querySelector('.page-body') as HTMLElement;
                if (pageBody) {
                    pageBody.style.bottom = `${reserveHeight}px`;
                }
            } else {
                wrapper.style.removeProperty(CHAT_BOTTOM_RESERVE_CSS_VAR);
                const pageBody = wrapper.querySelector('.page-body') as HTMLElement;
                if (pageBody) {
                    pageBody.style.bottom = '';
                }
            }

            if (wasNearBottom) scheduleStickToBottom();
        };

        const requestMeasure = () => {
            if (frame) window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(measure);
        };

        const overlay = findBottomOverlay(wrapper);
        if (overlay && typeof ResizeObserver !== "undefined") {
            observer = new ResizeObserver(requestMeasure);
            observer.observe(overlay);
        }

        measure();
        window.addEventListener("resize", requestMeasure);
        window.visualViewport?.addEventListener("resize", requestMeasure);
        window.visualViewport?.addEventListener("scroll", requestMeasure);

        return () => {
            if (frame) window.cancelAnimationFrame(frame);
            if (bottomScrollFrame) window.cancelAnimationFrame(bottomScrollFrame);
            observer?.disconnect();
            window.removeEventListener("resize", requestMeasure);
            window.visualViewport?.removeEventListener("resize", requestMeasure);
            window.visualViewport?.removeEventListener("scroll", requestMeasure);
        };
    }, [wrapperRef, scrollRef, refreshKey]);
}
