"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrentUserDecorator = void 0;
const common_1 = require("@nestjs/common");
exports.CurrentUserDecorator = (0, common_1.createParamDecorator)((_data, context) => {
    const request = context.switchToHttp().getRequest();
    return request.user;
});
