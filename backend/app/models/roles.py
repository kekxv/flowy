PROJECT_ROLES = {
    "project_lead": {"en": "Project Lead", "zh": "项目负责人", "color": "#8B5CF6"},
    "clerk": {"en": "Clerk", "zh": "文员", "color": "#F97316"},
    "backend_dev": {"en": "Backend Developer", "zh": "后端开发", "color": "#3B82F6"},
    "frontend_dev": {"en": "Frontend Developer", "zh": "前端开发", "color": "#06B6D4"},
    "tester": {"en": "QA Tester", "zh": "测试人员", "color": "#10B981"},
    "ui_designer": {"en": "UI Designer", "zh": "UI设计人员", "color": "#EC4899"},
    "devops": {"en": "DevOps", "zh": "运维", "color": "#6366F1"},
    "member": {"en": "Member", "zh": "成员", "color": "#6B7280"},
}

DEFAULT_ROLE = "member"


def get_role_color(role: str) -> str:
    return PROJECT_ROLES.get(role, PROJECT_ROLES[DEFAULT_ROLE])["color"]


def get_role_name(role: str, lang: str = "en") -> str:
    return PROJECT_ROLES.get(role, PROJECT_ROLES[DEFAULT_ROLE])[lang]
