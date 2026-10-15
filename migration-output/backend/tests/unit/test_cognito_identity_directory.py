import pytest

from domain.exceptions import ConflictError, ValidationError
from infrastructure.aws.cognito_identity_directory import CognitoIdentityDirectory


class _ClientError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.response = {"Error": {"Code": code}}


class _FakeCognito:
    def __init__(self, fail_with=None):
        self.calls = []
        self._fail_with = fail_with

    def admin_create_user(self, **kwargs):
        self.calls.append(("create", kwargs))
        if self._fail_with:
            raise _ClientError(self._fail_with)

    def admin_disable_user(self, **kwargs):
        self.calls.append(("disable", kwargs))
        if self._fail_with:
            raise _ClientError(self._fail_with)


def test_create_user_with_temporary_password_and_verified_email():
    client = _FakeCognito()
    CognitoIdentityDirectory("pool-test", client).create_user("eva@olo.com", "Segura#2026ok", "Eva")
    _, kwargs = client.calls[0]
    assert kwargs["UserPoolId"] == "pool-test"
    assert kwargs["Username"] == "eva@olo.com"
    assert kwargs["MessageAction"] == "SUPPRESS"
    assert {"Name": "email_verified", "Value": "true"} in kwargs["UserAttributes"]
    assert {"Name": "name", "Value": "Eva"} in kwargs["UserAttributes"]


def test_create_user_translates_errors():
    with pytest.raises(ConflictError, match="duplicate"):
        CognitoIdentityDirectory("p", _FakeCognito("UsernameExistsException")).create_user("a@b.co", "x", "")
    with pytest.raises(ValidationError):
        CognitoIdentityDirectory("p", _FakeCognito("InvalidPasswordException")).create_user("a@b.co", "x", "")
    with pytest.raises(_ClientError):
        CognitoIdentityDirectory("p", _FakeCognito("TooManyRequestsException")).create_user("a@b.co", "x", "")


def test_disable_user_ignores_missing_identity():
    CognitoIdentityDirectory("p", _FakeCognito("UserNotFoundException")).disable_user("a@b.co")
    with pytest.raises(_ClientError):
        CognitoIdentityDirectory("p", _FakeCognito("InternalErrorException")).disable_user("a@b.co")
