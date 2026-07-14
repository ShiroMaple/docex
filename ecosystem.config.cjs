module.exports = {
    apps: [
        {
            name: "docex", // 你的项目名称
            script: "./server.js", // 启动脚本指向 standalone 的入口
            env: {
                PORT: 4003, // 对应项目的端口
                NODE_ENV: "production"
            }
        }
    ]
};