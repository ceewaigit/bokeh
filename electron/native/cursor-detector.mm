#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#include <napi.h>
#import <string>

// Convert NSCursor to our cursor type string
std::string NSCursorToString(NSCursor* cursor) {
    if (!cursor) return "default";
    
    // Check against known system cursors
    if (cursor == [NSCursor arrowCursor]) return "default";
    if (cursor == [NSCursor IBeamCursor]) return "text";
    if (cursor == [NSCursor pointingHandCursor]) return "pointer";
    if (cursor == [NSCursor closedHandCursor]) return "grabbing";
    if (cursor == [NSCursor openHandCursor]) return "grab";
    if (cursor == [NSCursor crosshairCursor]) return "crosshair";
    if (cursor == [NSCursor resizeLeftCursor]) return "w-resize";
    if (cursor == [NSCursor resizeRightCursor]) return "e-resize";
    if (cursor == [NSCursor resizeUpCursor]) return "n-resize";
    if (cursor == [NSCursor resizeDownCursor]) return "s-resize";
    if (cursor == [NSCursor resizeLeftRightCursor]) return "ew-resize";
    if (cursor == [NSCursor resizeUpDownCursor]) return "ns-resize";
    if (cursor == [NSCursor contextualMenuCursor]) return "context-menu";
    if (cursor == [NSCursor disappearingItemCursor]) return "disappearing-item";
    if (cursor == [NSCursor dragCopyCursor]) return "copy";
    if (cursor == [NSCursor dragLinkCursor]) return "alias";
    if (cursor == [NSCursor operationNotAllowedCursor]) return "not-allowed";
    if (cursor == [NSCursor IBeamCursorForVerticalLayout]) return "vertical-text";
    
    // Check for resize diagonal cursors (these don't have direct NSCursor equivalents)
    NSString* cursorDescription = [cursor description];
    if ([cursorDescription containsString:@"resize"]) {
        if ([cursorDescription containsString:@"northeast"] || 
            [cursorDescription containsString:@"southwest"]) {
            return "nesw-resize";
        }
        if ([cursorDescription containsString:@"northwest"] || 
            [cursorDescription containsString:@"southeast"]) {
            return "nwse-resize";
        }
    }
    
    // Default fallback
    return "default";
}

// Check if we have accessibility permissions
bool HasAccessibilityPermissions() {
    return AXIsProcessTrusted();
}

// Request accessibility permissions if needed
bool RequestAccessibilityPermissions() {
    if (!HasAccessibilityPermissions()) {
        NSDictionary* options = @{(__bridge id)kAXTrustedCheckOptionPrompt: @YES};
        return AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options);
    }
    return true;
}

// Get cursor type using Accessibility API
std::string GetCursorTypeFromAccessibility() {
    if (!HasAccessibilityPermissions()) {
        return "default";
    }
    
    CGPoint mouseLocation;
    CGEventRef event = CGEventCreate(NULL);
    mouseLocation = CGEventGetLocation(event);
    CFRelease(event);
    
    AXUIElementRef systemWideElement = AXUIElementCreateSystemWide();
    AXUIElementRef elementUnderMouse = NULL;
    
    AXError error = AXUIElementCopyElementAtPosition(systemWideElement, 
                                                      mouseLocation.x, 
                                                      mouseLocation.y, 
                                                      &elementUnderMouse);
    
    std::string cursorType = "default";
    
    if (error == kAXErrorSuccess && elementUnderMouse) {
        CFTypeRef role = NULL;
        AXUIElementCopyAttributeValue(elementUnderMouse, kAXRoleAttribute, &role);
        
        if (role) {
            NSString* roleString = (__bridge NSString*)role;
            
            // Narrow mapping: avoid broad AXWebArea => text
            if ([roleString isEqualToString:(__bridge NSString*)kAXTextFieldRole] ||
                [roleString isEqualToString:(__bridge NSString*)kAXTextAreaRole] ||
                [roleString containsString:@"Text"]) {
                cursorType = "text";
            } else if ([roleString isEqualToString:@"AXLink"] ||
                       [roleString isEqualToString:(__bridge NSString*)kAXButtonRole]) {
                cursorType = "pointer";
            } else if ([roleString isEqualToString:(__bridge NSString*)kAXSliderRole] ||
                       [roleString isEqualToString:(__bridge NSString*)kAXScrollBarRole]) {
                cursorType = "grab";
            }
            
            CFRelease(role);
        }
        
        CFRelease(elementUnderMouse);
    }
    
    CFRelease(systemWideElement);
    
    return cursorType;
}

// N-API function to get current cursor type
Napi::String GetCurrentCursorType(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    @autoreleasepool {
        // Prefer system cursor first for accuracy
        NSCursor* currentCursor = [NSCursor currentCursor];
        if (!currentCursor) {
            currentCursor = [NSCursor currentSystemCursor];
        }
        if (!currentCursor) {
            currentCursor = [NSCursor arrowCursor];
        }
        std::string nsCursorType = NSCursorToString(currentCursor);
        // Trust NSCursor - it reflects what macOS is actually displaying
        // Don't use accessibility API fallback as it guesses based on element role,
        // not actual cursor appearance (causes false IBEAM over unclicked text fields)
        return Napi::String::New(env, nsCursorType);
    }
}

// N-API function to get cursor at specific screen coordinates - NOT USED, keeping for future use
Napi::String GetCursorAtPoint(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) {
        Napi::TypeError::New(env, "Expected two numbers (x, y)").ThrowAsJavaScriptException();
        return Napi::String::New(env, "default");
    }
    
    return GetCurrentCursorType(info);
}

// N-API function to check accessibility permissions
Napi::Boolean CheckAccessibilityPermissions(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    return Napi::Boolean::New(env, HasAccessibilityPermissions());
}

// N-API function to request accessibility permissions
Napi::Boolean RequestAccessibilityPermissionsAPI(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    return Napi::Boolean::New(env, RequestAccessibilityPermissions());
}

// Initialize the module
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "getCurrentCursorType"),
                Napi::Function::New(env, GetCurrentCursorType));
    exports.Set(Napi::String::New(env, "getCursorAtPoint"),
                Napi::Function::New(env, GetCursorAtPoint));
    exports.Set(Napi::String::New(env, "hasAccessibilityPermissions"),
                Napi::Function::New(env, CheckAccessibilityPermissions));
    exports.Set(Napi::String::New(env, "requestAccessibilityPermissions"),
                Napi::Function::New(env, RequestAccessibilityPermissionsAPI));
    return exports;
}

NODE_API_MODULE(cursor_detector, Init)
