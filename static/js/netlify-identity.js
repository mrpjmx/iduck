// Netlify Identity redirect handler
// 处理登录、密码重置、邀请链接的跳转

if (window.netlifyIdentity) {
  window.netlifyIdentity.on("init", user => {
    // 如果 URL 包含 recovery_token 或 invite_token，说明是密码重置或邀请链接
    // Identity widget 会自动处理这些 token 并触发 login 事件
    if (!user) {
      window.netlifyIdentity.on("login", () => {
        // 登录成功后跳转到 admin
        document.location.href = "/admin/";
      });
    }
  });
}