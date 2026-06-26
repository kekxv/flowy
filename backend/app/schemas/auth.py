from pydantic import BaseModel, EmailStr, Field


class UserRegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    display_name: str = Field(default="", max_length=128)


class UserLoginRequest(BaseModel):
    username_or_email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int
    token_type: str = "bearer"


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    display_name: str
    nickname: str
    role: str
    avatar_url: str
    is_active: bool
    created_at: str

    model_config = {"from_attributes": True}


class UserUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, max_length=128)
    nickname: str | None = Field(default=None, max_length=128)
    avatar_url: str | None = Field(default=None, max_length=512)


class PasswordChangeRequest(BaseModel):
    old_password: str
    new_password: str = Field(min_length=6, max_length=128)


class UserCreateRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    display_name: str = Field(default="", max_length=128)
    role: str = Field(default="member")


class PasswordResetRequest(BaseModel):
    new_password: str = Field(min_length=6, max_length=128)


class AuthStatusResponse(BaseModel):
    has_users: bool
